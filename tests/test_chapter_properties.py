import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import shutil
import uuid
import time
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'tools' / 'chapter_properties_helper.py'
spec = importlib.util.spec_from_file_location('chapter_properties', MODULE)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


@unittest.skipUnless(os.name == 'nt', 'Real Windows ADS required')
class ChapterPropertiesTests(unittest.TestCase):
    def setUp(self):
        self.fixture_base = (MODULE.parents[1] / 'tmp' / 'chapter-properties-tests').resolve()
        self.root = self.fixture_base / uuid.uuid4().hex
        self.root.mkdir(parents=True)
        (self.root / 'Chapters').mkdir()
        self.manifest = {'title': 'परीक्षण', 'parts': [{'no': 1, 'title': 'भाग', 'chapters': []}], 'chapters': []}
        for i in range(1, 4):
            relative = f'Chapters/chapter_{i:02}.txt'
            (self.root / relative).write_text(f'अध्याय {i} कहानी', encoding='utf-8')
            self.manifest['parts'][0]['chapters'].append({'no': i, 'title': f'Chapter {i}', 'content_path': relative})
        self.save_manifest()
        self.h = helper.ChapterProperties(self.root)

    def tearDown(self):
        assert self.root.resolve().is_relative_to(self.fixture_base) and self.root != self.fixture_base
        shutil.rmtree(self.root)

    def save_manifest(self):
        (self.root / helper.MANIFEST).write_bytes(helper.encode(self.manifest))

    def test_real_ads_keeps_text_unchanged_and_preserves_id_on_atomic_save(self):
        before = {p.name: p.read_bytes() for p in (self.root / 'Chapters').iterdir()}
        self.h.sync()
        record = self.h.ledger()['chapters'][0]
        self.assertEqual(self.h.read_ads(self.root / record['path'])['id'], record['id'])
        self.assertEqual(before, {p.name: p.read_bytes() for p in (self.root / 'Chapters').iterdir()})
        helper.atomic_write(self.root / record['path'], 'बदला पाठ'.encode())
        self.assertIsNone(self.h.read_ads(self.root / record['path']))
        with self.assertRaisesRegex(ValueError, 'Unconfirmed'):
            self.h.sync()
        self.h.sync(changed_paths=[record['path']])
        self.assertEqual(self.h.read_ads(self.root / record['path'])['id'], record['id'])

    def test_missing_and_unindexed_file_blocks_all_metadata_writes(self):
        self.manifest['parts'][0]['chapters'][-1]['content_path'] = 'Chapters/chapter_04.txt'
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'Index mismatch'):
            self.h.sync()
        self.assertFalse(self.h.state.exists())
        self.assertTrue(all(self.h.read_ads(p) is None for p in (self.root / 'Chapters').iterdir()))

    def test_rename_cycle_recovers_filenames_and_manifest_without_touching_other_data(self):
        self.h.sync()
        first = self.root / 'Chapters/chapter_01.txt'
        second = self.root / 'Chapters/chapter_02.txt'
        original = first.read_bytes()
        first.rename(self.root / 'Chapters/temp.txt')
        second.rename(first)
        (self.root / 'Chapters/temp.txt').rename(second)
        unrelated = self.root / 'Story_Naming.json'
        unrelated.write_bytes(b'{"unchanged":true}')
        with self.assertRaisesRegex(ValueError, 'Identity mismatch'):
            self.h.sync()
        self.assertEqual(self.h.recover()['mapping'][0]['from'], 'Chapters/chapter_02.txt')
        (self.root / helper.MANIFEST).write_bytes(b'broken index')
        self.h.recover(apply=True)
        self.assertEqual(first.read_bytes(), original)
        self.assertEqual(helper.read_json(self.root / helper.MANIFEST), self.manifest)
        self.assertEqual(unrelated.read_bytes(), b'{"unchanged":true}')

    def test_lost_ads_recovers_only_by_unique_exact_hash(self):
        self.h.sync()
        first = self.root / 'Chapters/chapter_01.txt'
        Path(str(first) + ':' + helper.STREAM).unlink()
        first.rename(self.root / 'Chapters/renamed.txt')
        self.h.recover(apply=True)
        self.assertTrue(first.exists())
        self.assertIsNotNone(self.h.read_ads(first))

    def test_ads_alone_rebuilds_index_after_backup_is_lost(self):
        self.h.sync()
        (self.h.state / 'index-backup.json').unlink()
        (self.root / helper.MANIFEST).unlink()
        self.h.recover(apply=True)
        self.assertEqual(helper.read_json(self.root / helper.MANIFEST), self.manifest)

    def test_ambiguous_hash_is_not_guessed(self):
        a = self.root / 'Chapters/chapter_01.txt'
        b = self.root / 'Chapters/chapter_02.txt'
        b.write_bytes(a.read_bytes())
        self.h.sync()
        for path in (a, b):
            Path(str(path) + ':' + helper.STREAM).unlink()
        with self.assertRaisesRegex(ValueError, 'ambiguous'):
            self.h.recover()

    def test_order_changes_keep_id_and_original_order(self):
        self.h.sync()
        prior = self.h.ledger()['chapters'][0]
        self.manifest['parts'][0]['chapters'].reverse()
        for i, c in enumerate(self.manifest['parts'][0]['chapters'], 1):
            c['no'] = i
        self.save_manifest()
        self.h.sync()
        record = self.h.ledger()['chapters'][-1]
        self.assertEqual(record['id'], prior['id'])
        self.assertEqual(record['originalGlobalOrder'], 1)
        self.assertEqual(record['globalOrder'], 3)

    def test_stale_manifest_and_path_escape_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'newer save'):
            self.h.sync(expected_manifest='wrong')
        with self.assertRaisesRegex(ValueError, 'newer text save'):
            self.h.sync(expected_content_hashes={'Chapters/chapter_01.txt': 'stale hash'})
        for path in ('../outside.txt', 'Chapters/../outside.txt', 'Chapters/file.txt:other', 'C:/outside.txt'):
            with self.assertRaises(ValueError):
                self.h.chapter_path(path)

    def test_external_deletion_removes_record_and_reindexes_without_renaming_text(self):
        self.h.sync()
        before = self.h.ledger()
        files = {r['path']: (self.root / r['path']).read_bytes() for r in before['chapters']}
        initial = self.root / 'Initial_Rendering'
        (initial / 'Naming_Documents').mkdir(parents=True)
        for name in ('Left_Panel.json', 'Active_Document.json', 'Status_Panel.json'):
            (initial / name).write_text('{}')
        naming = initial / 'Naming_Documents/deleted.json'
        naming.write_bytes(helper.encode({'document': {'kind': 'chapter', 'contentPath': 'Chapters/chapter_02.txt'}}))
        unrelated = self.root / 'Story_Naming.json'
        unrelated.write_bytes(b'{"untouched":true}')
        (self.root / 'Chapters/chapter_02.txt').unlink()
        self.assertIsNone(self.h.poll_deletions(now=0))
        self.assertIsNone(self.h.poll_deletions(now=2))
        result = self.h.poll_deletions(now=4)
        self.assertEqual(result['chapters'], 2)
        current = self.h.ledger()['chapters']
        self.assertEqual([r['order'] for r in current], [1, 2])
        self.assertEqual([r['globalOrder'] for r in current], [1, 2])
        self.assertEqual([r['id'] for r in current], [before['chapters'][0]['id'], before['chapters'][2]['id']])
        self.assertEqual(current[1]['originalGlobalOrder'], 3)
        self.assertFalse(naming.exists())
        self.assertFalse((initial / 'Left_Panel.json').exists())
        self.assertEqual(unrelated.read_bytes(), b'{"untouched":true}')
        for r in current:
            self.assertEqual((self.root / r['path']).read_bytes(), files[r['path']])
            self.assertEqual(self.h.read_ads(self.root / r['path'])['globalOrder'], r['globalOrder'])
        self.assertEqual(len(self.h.recovery_plan()[1]), 2)

    def test_stale_manifest_cannot_resurrect_a_deleted_chapter_record(self):
        self.h.sync()
        original = (self.root / helper.MANIFEST).read_bytes()
        (self.root / 'Chapters/chapter_02.txt').unlink()
        self.h.poll_deletions(now=0)
        self.h.poll_deletions(now=4)
        (self.root / helper.MANIFEST).write_bytes(original)
        self.h.poll_deletions(now=10)
        self.h.poll_deletions(now=14)
        self.assertEqual(len(self.h.ledger()['chapters']), 2)
        self.assertEqual(len(helper.chapter_rows(helper.read_json(self.root / helper.MANIFEST))), 2)

    def test_rename_and_transient_disappearance_do_not_delete_metadata(self):
        self.h.sync()
        original = (self.root / helper.MANIFEST).read_bytes()
        first = self.root / 'Chapters/chapter_01.txt'
        renamed = self.root / 'Chapters/renamed.txt'
        first.rename(renamed)
        with self.assertRaisesRegex(ValueError, 'renamed'):
            self.h.poll_deletions(now=0)
        self.assertEqual((self.root / helper.MANIFEST).read_bytes(), original)
        renamed.rename(first)
        temporarily_away = self.root / 'temporary.txt'
        first.rename(temporarily_away)
        self.assertIsNone(self.h.poll_deletions(now=10))
        temporarily_away.rename(first)
        self.assertIsNone(self.h.poll_deletions(now=14))
        self.assertEqual((self.root / helper.MANIFEST).read_bytes(), original)

    def test_delete_all_files_keeps_empty_parts_but_missing_directory_does_not(self):
        self.h.sync()
        directory = self.root / 'Chapters'
        directory.rename(self.root / 'away')
        with self.assertRaises(FileNotFoundError):
            self.h.poll_deletions(now=0)
        (self.root / 'away').rename(directory)
        for path in directory.iterdir():
            path.unlink()
        self.h.poll_deletions(now=0)
        self.h.poll_deletions(now=4)
        self.assertEqual(self.h.ledger()['chapters'], [])
        self.assertEqual(helper.read_json(self.root / helper.MANIFEST)['parts'][0]['chapters'], [])

    def test_deletion_commit_retries_after_properties_failure(self):
        self.h.sync()
        (self.root / 'Chapters/chapter_02.txt').unlink()
        self.h.poll_deletions(now=0)
        sync = self.h.sync
        def failing_sync(*args, **kwargs):
            raise OSError('simulated ADS write failure')
        self.h.sync = failing_sync
        with self.assertRaisesRegex(OSError, 'simulated'):
            self.h.poll_deletions(now=4)
        self.assertEqual(helper.read_json(self.h.state / 'deletion-state.json')['phase'], 'pending')
        self.h.sync = sync
        self.h.poll_deletions(now=5)
        self.assertEqual(helper.read_json(self.h.state / 'deletion-state.json')['phase'], 'applied')
        self.assertEqual(len(self.h.ledger()['chapters']), 2)

    def test_native_watcher_consumes_committed_save_request(self):
        proc = subprocess.Popen([sys.executable, str(MODULE), 'watch', '--project', str(self.root)],
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            def wait_for(test):
                deadline = time.monotonic() + 8
                while time.monotonic() < deadline:
                    try:
                        value = test()
                        if value:
                            return value
                    except (FileNotFoundError, json.JSONDecodeError):
                        pass
                    time.sleep(.1)
                self.fail('Watcher did not acknowledge the save')
            wait_for(lambda: helper.read_json(self.h.state / 'status.json')['ok'])
            enabled = helper.read_json(self.h.state / 'enabled.json')
            path = 'Chapters/chapter_01.txt'
            helper.atomic_write(self.root / path, b'edited through browser')
            request = {'nonce': enabled['nonce'], 'requestId': 'test-save',
                       'manifestHash': helper.digest((self.root / helper.MANIFEST).read_bytes()), 'changedPaths': [path]}
            helper.atomic_write(self.h.state / 'save-request.json', helper.encode(request))
            status = wait_for(lambda: (s if s.get('requestId') == 'test-save' else None)
                              if (s := helper.read_json(self.h.state / 'status.json')) else None)
            self.assertTrue(status['ok'], status)
            self.assertEqual(self.h.read_ads(self.root / path)['contentHash'], helper.digest(b'edited through browser'))
            (self.root / 'Chapters/chapter_02.txt').unlink()
            wait_for(lambda: helper.read_json(self.h.state / 'deletion-state.json').get('phase') == 'applied')
            self.assertEqual(len(self.h.ledger()['chapters']), 2)
            self.h.stop()
            proc.wait(timeout=5)
            self.assertFalse((self.h.state / 'enabled.json').exists())
        finally:
            if proc.poll() is None:
                proc.terminate()
            proc.communicate(timeout=5)


if __name__ == '__main__':
    unittest.main()
