"""Windows-only chapter ADS backup and index recovery. No network listener."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import time
import uuid

STREAM = 'LekhakChapter'
STATE = '.chapter-properties'
MANIFEST = 'Chapters_info.json'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return json.dumps(value, ensure_ascii=False, indent=2).encode('utf-8')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def atomic_write(path, data):
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temp.open('xb') as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()


def chapter_rows(manifest):
    rows = []
    for part_index, part in enumerate(manifest.get('parts', [])):
        for chapter in part.get('chapters', []):
            rows.append((part_index, chapter))
    rows.extend((-1, chapter) for chapter in manifest.get('chapters', []))
    return rows


class ChapterProperties:
    def __init__(self, project):
        if os.name != 'nt':
            raise ValueError('This helper requires Windows and a filesystem supporting ADS.')
        self.root = Path(project).resolve(strict=True)
        self.state = self.root / STATE
        if self.state.exists() and (self.state.is_symlink() or self.state.is_junction()):
            raise ValueError('The helper state directory must not be a link.')
        self._deletion_observation = None

    def chapter_path(self, relative):
        if not isinstance(relative, str) or '\\' in relative or ':' in relative:
            raise ValueError('Invalid chapter path.')
        parts = PurePosixPath(relative).parts
        if len(parts) != 2 or parts[0] != 'Chapters' or parts[1] in ('.', '..'):
            raise ValueError('Only direct files inside Chapters are supported.')
        path = self.root.joinpath(*parts)
        if path.suffix.lower() != '.txt' or path.is_symlink():
            raise ValueError('Only ordinary TXT chapter files are supported.')
        if path.parent.is_junction() or path.parent.resolve() != self.root / 'Chapters':
            raise ValueError('Chapters must not redirect outside the project.')
        if path.exists() and path.stat().st_nlink != 1:
            raise ValueError('Hard-linked chapter files are not supported.')
        return path

    def inventory(self):
        return {f'Chapters/{p.name}': self.chapter_path(f'Chapters/{p.name}')
                for p in (self.root / 'Chapters').iterdir()
                if p.suffix.lower() == '.txt'}

    def read_ads(self, path):
        try:
            return read_json(Path(str(path) + ':' + STREAM))
        except FileNotFoundError:
            return None

    def write_ads(self, path, value):
        stream = Path(str(path) + ':' + STREAM)
        stream.write_bytes(encode(value))
        if read_json(stream) != value:
            raise ValueError('Chapter properties verification failed.')

    def ledger(self):
        path = self.state / 'index-backup.json'
        return read_json(path) if path.exists() else None

    def sync(self, expected_manifest=None, changed_paths=(), expected_content_hashes=None):
        manifest_bytes = (self.root / MANIFEST).read_bytes()
        if expected_manifest and digest(manifest_bytes) != expected_manifest:
            raise ValueError('A newer save is in progress; properties were not updated.')
        manifest = json.loads(manifest_bytes.decode('utf-8-sig'))
        rows = chapter_rows(manifest)
        paths = [c.get('content_path') for _, c in rows]
        if len({str(p).casefold() for p in paths}) != len(paths):
            raise ValueError('Duplicate chapter paths; repair the index first.')
        files = self.inventory()
        missing = [p for p in paths if p not in files]
        extra = [p for p in files if p not in paths]
        if missing or extra:
            raise ValueError(f'Index mismatch. Missing: {missing}; unindexed: {extra}. No properties changed.')
        old = self.ledger()
        project_id = old['projectId'] if old else str(uuid.uuid4())
        previous = {r['path']: r for r in old['chapters']} if old else {}
        properties = []
        seen_ids = set()
        fingerprints = {}
        for index, (part_index, chapter) in enumerate(rows):
            relative = chapter['content_path']
            path = self.chapter_path(relative)
            content_hash = digest(path.read_bytes())
            expected_hash = (expected_content_hashes or {}).get(relative)
            if expected_hash and content_hash != expected_hash:
                raise ValueError(f'A newer text save is in progress at {relative}; retry after saving.')
            fingerprints[relative] = content_hash
            ads = self.read_ads(path)
            prior = previous.get(relative)
            if ads and (ads.get('projectId') != project_id or (prior and ads.get('id') != prior['id'])):
                raise ValueError(f'Identity mismatch at {relative}; run recovery before saving properties.')
            if prior and content_hash != prior['contentHash'] and relative not in changed_paths:
                raise ValueError(f'Unconfirmed text change at {relative}; save that chapter in the editor first.')
            chapter_id = prior['id'] if prior else (ads['id'] if ads else str(uuid.uuid4()))
            if chapter_id in seen_ids:
                raise ValueError('Duplicate chapter ID; automatic sync blocked.')
            seen_ids.add(chapter_id)
            properties.append({
                'schemaVersion': 1, 'projectId': project_id, 'id': chapter_id,
                'path': relative, 'title': chapter.get('title', ''),
                'partIndex': part_index, 'order': chapter.get('no', index + 1),
                'globalOrder': index + 1,
                'originalGlobalOrder': prior['originalGlobalOrder'] if prior else index + 1,
                'originalPartIndex': prior.get('originalPartIndex', part_index) if prior else part_index,
                'originalOrder': prior.get('originalOrder', chapter.get('no', index + 1)) if prior else chapter.get('no', index + 1),
                'contentHash': content_hash,
                'chapter': chapter,
                'part': {k: v for k, v in manifest['parts'][part_index].items() if k != 'chapters'} if part_index >= 0 else None,
                'project': {k: v for k, v in manifest.items() if k not in ('chapters', 'parts')},
            })
        if (self.root / MANIFEST).read_bytes() != manifest_bytes:
            raise ValueError('The manifest changed during the scan; retry after saving.')
        if any(digest(files[p].read_bytes()) != h for p, h in fingerprints.items()):
            raise ValueError('Chapter text changed during the scan; retry after saving.')
        self.state.mkdir(exist_ok=True)
        # The backup is durable BEFORE ADS writes: browser atomic replacement can drop ADS.
        payload = {'schemaVersion': 1, 'projectId': project_id,
                   'manifest': manifest, 'chapters': properties}
        if old and old != payload:
            atomic_write(self.state / 'index-previous.json', encode(old))
        atomic_write(self.state / 'index-backup.json', encode(payload))
        for record in properties:
            path = files[record['path']]
            if self.read_ads(path) != record:
                self.write_ads(path, record)
        return {'ok': True, 'chapters': len(properties), 'message': 'Chapter properties saved.'}

    def backup_from_ads(self):
        records = [self.read_ads(path) for path in self.inventory().values()]
        if not records or any(not r or not r.get('chapter') for r in records):
            raise ValueError('Complete saved chapter properties are required to rebuild without the backup.')
        project_ids = {r['projectId'] for r in records}
        orders = [r['globalOrder'] for r in records]
        if len(project_ids) != 1 or sorted(orders) != list(range(1, len(records) + 1)):
            raise ValueError('Mixed projects, missing chapters, or duplicate order in properties.')
        records.sort(key=lambda r: r['globalOrder'])
        header = records[0]['project']
        if any(r['project'] != header for r in records):
            raise ValueError('Mixed save versions in properties; restore the index backup first.')
        parts = {}
        raw = []
        for record in records:
            index = record['partIndex']
            if index < 0:
                raw.append(record['chapter'])
            else:
                if index in parts and {k: v for k, v in parts[index].items() if k != 'chapters'} != record['part']:
                    raise ValueError('Inconsistent part properties.')
                parts.setdefault(index, {**record['part'], 'chapters': []})['chapters'].append(record['chapter'])
        if sorted(parts) != list(range(len(parts))):
            raise ValueError('An empty/missing part requires the full index backup for recovery.')
        manifest = {**header, 'parts': [parts[i] for i in sorted(parts)], 'chapters': raw}
        return {'schemaVersion': 1, 'projectId': records[0]['projectId'], 'manifest': manifest, 'chapters': records}

    def deletion_snapshot(self):
        """Missing directory/access errors are NOT an empty Chapters directory."""
        raw = (self.root / MANIFEST).read_bytes()
        manifest = json.loads(raw.decode('utf-8-sig'))
        paths = [c.get('content_path') for _, c in chapter_rows(manifest)]
        for path in paths:
            self.chapter_path(path)
        if len({p.casefold() for p in paths}) != len(paths):
            raise ValueError('Duplicate chapter paths; automatic deletion reconciliation stopped.')
        files = self.inventory()
        missing = sorted(set(paths) - set(files))
        if not missing:
            return None
        # A rename/copy/move in progress must never be mistaken for a deletion.
        if set(files) - set(paths):
            raise ValueError('Unindexed or renamed TXT files exist; no chapter metadata removed.')
        stats = [(name, path.stat().st_size, path.stat().st_mtime_ns) for name, path in sorted(files.items())]
        signature = digest(encode([digest(raw), stats, missing]))
        return signature, raw, manifest, files, missing

    def invalidate_chapter_snapshots(self, removed):
        # Derived chapter views only; canonical Naming/Facts/Draft data is untouched.
        initial = self.root / 'Initial_Rendering'
        if not initial.resolve().is_relative_to(self.root):
            raise ValueError('Snapshot directory redirects outside this project.')
        if not (initial / 'Naming_Documents').resolve().is_relative_to(self.root):
            raise ValueError('Naming snapshot directory redirects outside this project.')
        for name in ('Left_Panel.json', 'Active_Document.json', 'Status_Panel.json'):
            path = initial / name
            if path.exists():
                path.unlink()
        for path in (initial / 'Naming_Documents').glob('*.json'):
            try:
                document = read_json(path).get('document', {})
            except (ValueError, OSError):
                continue
            if document.get('kind') == 'chapter' and document.get('contentPath') in removed:
                path.unlink()

    def finish_deletion(self, event):
        result = self.sync(changed_paths=event.get('changedPaths', []),
                           expected_content_hashes=event.get('contentHashes'))
        self.invalidate_chapter_snapshots(set(event['removedNow']))
        event['phase'] = 'applied'
        atomic_write(self.state / 'deletion-state.json', encode(event))
        result.update(deletedPaths=event['removedNow'], revision=event['revision'],
                      reconciledManifestHash=event.get('previousManifestHash'),
                      message=f'{len(event["removedNow"])} deleted chapter record(s) removed; remaining chapter order reset. Reopen the project.')
        return result

    def reconcile_deletions(self, snapshot):
        signature, raw, manifest, files, missing = snapshot
        old = self.ledger()
        if not old:
            raise ValueError('A saved identity backup is required before removing missing chapter records.')
        previous = {r['path']: r for r in old['chapters']}
        prior_event_path = self.state / 'deletion-state.json'
        prior_event = read_json(prior_event_path) if prior_event_path.exists() else {}
        tombstones = set(prior_event.get('deletedPaths', []))
        if any(path not in previous and path not in tombstones for path in missing):
            raise ValueError('A missing path has no saved identity; automatic removal stopped.')
        approved = {}
        request_path = self.state / 'save-request.json'
        if request_path.exists():
            request = read_json(request_path)
            enabled_path = self.state / 'enabled.json'
            enabled = read_json(enabled_path) if enabled_path.exists() else {}
            if request.get('manifestHash') == digest(raw) and request.get('nonce') == enabled.get('nonce'):
                approved = request.get('contentHashes', {})
        for relative, path in files.items():
            prior = previous.get(relative)
            ads = self.read_ads(path)
            if ads and (ads.get('projectId') != old['projectId'] or not prior or ads.get('id') != prior['id']):
                raise ValueError('Surviving chapter identity mismatch; no records removed.')
            actual = digest(path.read_bytes())
            if prior and actual != prior['contentHash'] and approved.get(relative) != actual:
                raise ValueError('A surviving chapter has an unconfirmed text change; no records removed.')
        latest = self.deletion_snapshot()
        if not latest or latest[0] != signature:
            raise ValueError('Project changed during deletion reconciliation; retrying after it settles.')
        updated = copy.deepcopy(manifest)
        removed = set(missing)
        for container in [*updated.get('parts', []), updated]:
            remaining = [c for c in container.get('chapters', []) if c['content_path'] not in removed]
            for number, chapter in enumerate(remaining, 1):
                chapter['no'] = number
                if 'chapterNo' in chapter:
                    chapter['chapterNo'] = number
            container['chapters'] = remaining
        event_path = self.state / 'deletion-state.json'
        previous_event = read_json(event_path) if event_path.exists() else {}
        updated_bytes = encode(updated)
        event = {'schemaVersion': 1, 'revision': uuid.uuid4().hex, 'phase': 'pending',
                 'deletedPaths': sorted(set(previous_event.get('deletedPaths', [])) | removed),
                 'removedNow': missing, 'manifestHash': digest(updated_bytes), 'previousManifestHash': digest(raw),
                 'changedPaths': list(approved), 'contentHashes': approved}
        # Durable marker blocks a stale editor from resurrecting these paths.
        # Previous metadata is a recovery copy, never an active chapter record.
        atomic_write(self.state / 'index-before-deletion.json', encode(old))
        atomic_write(event_path, encode(event))
        if (self.root / MANIFEST).read_bytes() != raw:
            raise ValueError('Manifest changed before deletion commit; retry after saving.')
        atomic_write(self.root / MANIFEST, updated_bytes)
        return self.finish_deletion(event)

    def poll_deletions(self, now=None):
        event_path = self.state / 'deletion-state.json'
        if event_path.exists():
            event = read_json(event_path)
            if event.get('phase') == 'pending' and digest((self.root / MANIFEST).read_bytes()) == event['manifestHash']:
                return self.finish_deletion(event)
        snapshot = self.deletion_snapshot()
        if not snapshot:
            self._deletion_observation = None
            return None
        now = time.monotonic() if now is None else now
        if not self._deletion_observation or self._deletion_observation[0] != snapshot[0]:
            self._deletion_observation = (snapshot[0], now)
            return None
        if now - self._deletion_observation[1] < 3:
            return None
        result = self.reconcile_deletions(snapshot)
        self._deletion_observation = None
        return result

    def recovery_plan(self):
        backup = self.ledger() or self.backup_from_ads()
        if not backup:
            raise ValueError('No saved chapter identity/index backup exists. Original order cannot be inferred.')
        files = self.inventory()
        scanned = [(relative, self.read_ads(path), digest(path.read_bytes())) for relative, path in files.items()]
        used = set()
        mapping = []
        for record in backup['chapters']:
            candidates = [(p, h) for p, ads, h in scanned if ads and ads.get('id') == record['id']
                          and ads.get('projectId') == backup['projectId']]
            if not candidates:
                candidates = [(p, h) for p, ads, h in scanned if not ads and h == record['contentHash']]
            if len(candidates) != 1 or candidates[0][0] in used:
                raise ValueError(f'Missing or ambiguous identity: {record["title"]}. Recovery stopped.')
            source, content_hash = candidates[0]
            if content_hash != record['contentHash']:
                raise ValueError(f'Unsaved/external content change in {source}; recovery stopped.')
            used.add(source)
            mapping.append({'from': source, 'to': record['path'], 'id': record['id']})
        if used != set(files):
            raise ValueError('Extra chapter files exist; recovery will not discard or guess their identity.')
        return backup, mapping

    def recover(self, apply=False):
        backup, mapping = self.recovery_plan()
        result = {'ok': True, 'apply': apply, 'mapping': mapping,
                  'message': 'Restores filenames and the last saved chapter index. Close the editor before applying.'}
        if not apply:
            return result
        if (self.state / 'enabled.json').exists():
            raise ValueError('Stop the helper watcher and close the editor before applying recovery.')
        # Validate every destination before staging; never overwrite unrelated files.
        for item in mapping:
            self.chapter_path(item['to'])
        self.state.mkdir(exist_ok=True)
        recovery_dir = self.state / ('recovery-' + uuid.uuid4().hex)
        recovery_dir.mkdir()
        manifest_path = self.root / MANIFEST
        original = manifest_path.read_bytes() if manifest_path.exists() else None
        if original is not None:
            atomic_write(recovery_dir / MANIFEST, original)
        atomic_write(recovery_dir / 'plan.json', encode(mapping))
        staged = []
        placed = []
        try:
            for index, item in enumerate(mapping):
                if item['from'] == item['to']:
                    continue
                temporary = recovery_dir / f'{index}.txt'
                self.chapter_path(item['from']).rename(temporary)
                staged.append((item, temporary))
            for item, temporary in staged:
                temporary.rename(self.chapter_path(item['to']))
                placed.append((item, temporary))
            atomic_write(manifest_path, encode(backup['manifest']))
        except Exception:
            for item, temporary in reversed(placed):
                self.chapter_path(item['to']).rename(temporary)
            for item, temporary in reversed(staged):
                temporary.rename(self.chapter_path(item['from']))
            if original is not None:
                atomic_write(manifest_path, original)
            raise
        # New manifest fingerprint invalidates Left_Panel automatically on reopen.
        atomic_write(self.state / 'index-backup.json', encode(backup))
        self.sync()
        result['message'] = 'Filenames and saved chapter index restored. Reopen the project.'
        return result

    def watch(self):
        self.state.mkdir(exist_ok=True)
        nonce = uuid.uuid4().hex
        enabled = self.state / 'enabled.json'
        # Exclusive ownership avoids two watchers racing over metadata.
        with enabled.open('x', encoding='utf-8') as handle:
            json.dump({'schemaVersion': 1, 'nonce': nonce, 'pid': os.getpid()}, handle)
        last_request = None
        last_scan_error = None
        try:
            try:
                status = self.sync()
            except Exception as error:
                status = {'ok': False, 'message': str(error)}
            status['nonce'] = nonce
            atomic_write(self.state / 'status.json', encode(status))
            print(status['message'], flush=True)
            print('Watching chapter saves. Keep this window open; Ctrl+C stops the helper.', flush=True)
            while True:
                time.sleep(0.5)
                stop_path = self.state / 'stop-request.json'
                if stop_path.exists() and read_json(stop_path).get('nonce') == nonce:
                    break
                try:
                    deletion_result = self.poll_deletions()
                    last_scan_error = None
                    if deletion_result:
                        saved_request = self.state / 'save-request.json'
                        if saved_request.exists():
                            saved = read_json(saved_request)
                            if saved.get('nonce') == nonce and saved.get('manifestHash') == deletion_result.get('reconciledManifestHash'):
                                last_request = saved.get('requestId')
                        deletion_result.update(nonce=nonce, requestId=last_request)
                        atomic_write(self.state / 'status.json', encode(deletion_result))
                        print(deletion_result['message'], flush=True)
                except (ValueError, OSError) as error:
                    if str(error) != last_scan_error:
                        last_scan_error = str(error)
                        atomic_write(self.state / 'status.json', encode({'ok': False, 'nonce': nonce, 'message': str(error)}))
                        print(str(error), flush=True)
                request_path = self.state / 'save-request.json'
                if not request_path.exists():
                    continue
                try:
                    request = read_json(request_path)
                    if request.get('nonce') != nonce or request.get('requestId') == last_request:
                        continue
                    last_request = request.get('requestId')
                    result = self.sync(request['manifestHash'], request.get('changedPaths', []), request.get('contentHashes'))
                except Exception as error:
                    result = {'ok': False, 'message': str(error)}
                result.update(nonce=nonce, requestId=last_request)
                atomic_write(self.state / 'status.json', encode(result))
                print(result['message'], flush=True)
        finally:
            if enabled.exists() and read_json(enabled).get('nonce') == nonce:
                enabled.unlink()

    def stop(self):
        enabled = self.state / 'enabled.json'
        if not enabled.exists():
            return {'ok': True, 'message': 'Helper is already stopped.'}
        session = read_json(enabled)
        atomic_write(self.state / 'stop-request.json', encode({'nonce': session['nonce']}))
        return {'ok': True, 'message': 'Stop requested; the helper finishes its current operation first.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['watch', 'sync', 'recover', 'stop'])
    parser.add_argument('--project', help='Novel folder containing Chapters_info.json')
    parser.add_argument('--apply', action='store_true', help='Apply recovery (editor and watcher must be closed)')
    args = parser.parse_args()
    if not args.project:
        from tkinter import Tk, filedialog
        ui = Tk()
        ui.withdraw()
        args.project = filedialog.askdirectory(title='Select the novel folder containing Chapters_info.json')
        ui.destroy()
        if not args.project:
            return
    helper = ChapterProperties(args.project)
    if args.command == 'watch':
        helper.watch()
    else:
        if args.command == 'sync' and (helper.state / 'enabled.json').exists():
            raise ValueError('Stop the watcher before running a separate sync.')
        result = helper.recover(args.apply) if args.command == 'recover' else helper.stop() if args.command == 'stop' else helper.sync()
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as error:
        print(f'Chapter properties: {error}', file=sys.stderr)
        sys.exit(1)
