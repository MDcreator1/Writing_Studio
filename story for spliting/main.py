import os
import pyperclip
import re
import time

script_dir = os.path.dirname(os.path.abspath(__file__))

class TextEditor:
    SENTENCE_END = ["।", ".", "!", "?", "……", "---"]
    def __init__(self, text: str):
        self.text = re.sub(r"[ ]{2,}", " ", text)

    def wordcount(self):
        return len(re.findall(r"\S+", self.text))

    def find_word(self, word):
        return self.text.count(word)

    def replace_word(self, word, new_word):
        if self.find_word(word) == 0:
            return "No word found"
        return self.text.replace(word.strip(), new_word.strip())

    def find_symbol_index(self, txt, r_or_l = "l"):
        if r_or_l == "r":
            txt = txt[::-1]
            positions = [txt.find(s) for s in self.SENTENCE_END]
        else:
            positions = [txt.find(s) for s in self.SENTENCE_END]
        positions = [p for p in positions if p != -1]
        return min(positions) + 1 if positions else "ns"

    def safe_split(self, limit=2500):
        text = self.text
        tokens = re.split(r"(\s+)", text)
        word_count = 0
        idx = 0

        while idx < len(tokens) and word_count < limit:
            if not tokens[idx].isspace():
                word_count += 1
            idx += 1

        left = "".join(tokens[:idx])
        right = "".join(tokens[idx:])

        return left, right

    def smart_split(self, limit=2500):
        left, right = self.safe_split(limit)

        if not right.strip():
            return [left, right]

        cut = self.find_symbol_index(right)

        has_open_0 = left.rfind("“")
        has_close_0 = left.rfind("”")
        has_close_1 = right.find("”")



        if left.find("“") != -1:
            if has_open_0 != -1 and has_close_0 != -1:
                if has_close_0 == 0:
                    cut = 0

                elif has_close_0 < has_open_0:
                    cut = has_close_1 + 1

                elif has_open_0 > has_close_0:
                    cut = cut

            elif has_open_0 != -1:
                cut = has_close_1 + 1

            final_left = left + right[:cut]
            final_right = right[cut:]
            return [final_left.strip(), final_right.strip()]

        if cut == "ns":
            return [left, right]

        elif left[-1] in self.SENTENCE_END:
            return [left.strip(), right.strip()]

        else:
            idx = right.find("\n")
            return [left+right[:idx], right[idx:]]

    def last_santance(self, text="none", parameter=0):
        if text != "none":
            full = text.strip()
        else:
            full = self.text.strip()

        if parameter > 0:
            first_part, _ = self.smart_split(parameter)
            full = first_part.strip()

        if "{Note" in full:
            cleaned = full.split("{Note")[0].strip()
        else:
            cleaned = full

        if cleaned.endswith("”"):
            rev = cleaned[::-1]
            op = rev.find("“")
            if op != -1:
                start = len(cleaned) - (op + 2)
                return cleaned[start:].strip()

        elif cleaned[-1] in self.SENTENCE_END:
            s_idx = self.find_symbol_index(cleaned[:-1], "r")
            return cleaned[-s_idx:].strip()

        words = cleaned.split()

        if len(words) <= 6:
            return cleaned
        else:
            return " ".join(words[-6:]).strip()

    def fix_split_for_chapter(self, parameter=2500):
        first_part, rest = self.smart_split(parameter)
        first_part = first_part.strip()
        rest = rest.strip()
        last_sentence = self.last_santance()
        last_sentence_wc = TextEditor(last_sentence).wordcount()

        if last_sentence_wc >= 18:
            safe_first = first_part[:-len(last_sentence)].strip()
            if TextEditor(safe_first).wordcount() <= parameter - 10:
                if rest.startswith("“"):
                    end = rest.find("”")
                    if end != -1:
                        front = first_part + "\n\n" + rest[:end+1]
                        back = rest[end+1:].strip()
                        return [front.strip(), back]

                sym = self.find_symbol_index(rest)
                if sym != -1:
                    front = first_part + "\n\n" + rest[:sym+1]
                    back = rest[sym+1:].strip()
                    return [front.strip(), back]

                return [first_part, rest]

            else:
                last_word = first_part.split()[-1]
                if "”" in last_word:
                    rev = first_part[::-1]
                    op = rev.find("“")
                    if op != -1:
                        cut = len(first_part) - (op + 1)
                        front = first_part[:cut].strip()
                        back = first_part[cut:].strip() + "\n\n" + rest
                        return [front, back]

                sym = self.find_symbol_index(first_part, "r")

                if sym != -1:
                    cut = len(first_part) - sym +1
                    front = first_part[:cut].strip()
                    back = first_part[cut:].strip() + "\n\n" + rest

                    return [front, back]

                return [first_part, rest]

        return [first_part, rest]



class Chapters(TextEditor):

    def __init__(self, source_file="textfile"):
        self.file = TxtFileFunctions()
        self.source_file = source_file
        self.refresh_source()

    def refresh_source(self):
        """Always fetch fresh data from source file."""
        self.text = self.file.open_file(self.source_file)


    def create_chapter_file(self, parameter, no_of_chapters=1, addcon="y", remender="story"):
        self.refresh_source()
        total = no_of_chapters
        i = 1

        for k in range(1, total + 1):
            pdata = self.file.chapter_preview(k)

            if pdata not in ["", "Empty"]:
                print(f"chapter {k} already exists with data.")

                choice = input(
                    "1: Rewrite\n"
                    "2: Skip to next available chapter\n"
                    "3: Delete all and create new\n"
                    "0: Cancel\n"
                    "Enter choice: "
                )

                if choice == "1":
                    pass
                elif choice == "0":
                    return
                elif choice == "3":
                    self.file.clear_all_chapters("d", "2")
                    break
                else:
                    total += 1
                    i = k

        while i <= total:

            self.refresh_source()
            words = self.wordcount()

            if words < parameter * no_of_chapters:
                print("Not enough words to make chapters.")
                break

            first_part, rest = self.fix_split_for_chapter(parameter)
            first_part = first_part.strip()
            rest = rest.strip()

            if addcon == "y":
                conclue = self.file.open_file("conclusion_part")
                if conclue == "Empty":
                    print("conclusion file not found. Creating empty conclusion file.")
                    self.file.create_text_file("conclusion_part", "")
                    conclue = ""
                data = first_part + "\n\n\n" + conclue
            else:
                data = first_part + " "

            self.file.edit_custom_chapter(i, data)

            lastline = TextEditor(data).last_santance()
            self.file.create_text_file("lastline", lastline)

            if remender == "c":
                self.file.create_text_file(self.source_file, rest)

            elif remender == "story":
                new_text = lastline + "\n" + rest
                self.file.create_text_file(self.source_file, new_text)

            i += 1
            no_of_chapters -= 1

            if no_of_chapters == 0:
                print(f"{total} chapters created successfully.")




class TxtFileFunctions:
    EMPTY = "Empty"

    def __init__(self, base_dir=None):
        self.base_dir = base_dir or script_dir
        self.Chapters_dir = self.open_file("Chapters_parts_path")

    def _path(self, name, dirname=None):
        if dirname:
            return os.path.join(self.base_dir, dirname, f"{name}.txt")
        return os.path.join(self.base_dir, f"{name}.txt")

    def _chapter_name(self, num):
        return f"chapter_{num:02d}"

    def open_file(self, name, dirname=None, C_path = None):
        path = self._path(name.lower(), dirname)
        if C_path:
            path = os.path.join(C_path, f"{name}.txt")

        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except FileNotFoundError:
            return self.EMPTY

    def create_text_file(self, name, data, dirname=None, C_path = None):
        path = self._path(name.lower(), dirname)
        if C_path:
            path = os.path.join(C_path, f"{name}.txt")

        with open(path, "w", encoding="utf-8") as f:
            f.write(data)

    def delete_file(self, name, dirname=None, ty="d"):
        path = self._path(name, dirname)
        if ty == "c":
            path = os.path.join(self.Chapters_dir, f"{name}.txt")
        try:
            os.remove(path)
        except FileNotFoundError:
            print("File not found")

    def chapter_preview(self, chapter_no):
        name = self._chapter_name(chapter_no)
        return self.open_file(name, C_path=self.Chapters_dir)

    def chapter_count(self):
        i = 1
        while True:
            if self.chapter_preview(i) == self.EMPTY:
                return i - 1
            i += 1

    def all_chapters_wordcount(self):
        counts = []
        for i in range(1, self.chapter_count() + 1):
            text = self.chapter_preview(i)
            counts.append(TextEditor(text).wordcount())
        return counts

    def clear_all_chapters(self, mode="c", delete_mode="1"):
        total = self.chapter_count()

        for i in range(total, 0, -1):
            name = self._chapter_name(i)

            if mode.lower() == "c":
                self.create_text_file(name, "")

            elif mode.lower() == "d":
                if delete_mode == "1":
                    if self.open_file(name) == "":
                        self.delete_file(name, ty = "c")
                elif delete_mode == "2":
                    self.delete_file(name, ty = "c")

    def edit_custom_chapter(self, chapter_no, text):
        name = self._chapter_name(chapter_no)
        self.create_text_file(name, text, C_path=self.Chapters_dir)

    def edit_all_chapters(self, text):
        total = self.chapter_count()

        if total == 0:
            ch = input("No chapters found. Create chapter? (y/n): ")
            if ch.lower() != "y":
                return "none"
            total = int(input("Enter chapter number: "))

        for i in range(total, 0, -1):
            name = self._chapter_name(i)
            self.create_text_file(name, text)

    def reverse_chapters(self, target="d"):
        total = self.chapter_count()
        full_text = ""

        for i in range(1, total + 1):
            text = self.chapter_preview(i)
            last_line = TextEditor(text).last_santance()
            if text == self.EMPTY:
                continue

            try:
                clean = text.split("{Note")[0].strip()
                text = clean.strip().replace(last_line, "")
                full_text += text
            except:
                print("Error processing chapter", i)
                full_text += text.strip().replace(last_line, "")

        full_text = full_text.strip()

        if target.lower() == "c":
            name = input("Enter new filename: ")
            self.create_text_file(name, full_text)
            self.clear_all_chapters("d", "2")

        elif target.lower() == "d":
            old = self.open_file("textfile")
            self.create_text_file("textfile", full_text + " " + old.strip())
            self.clear_all_chapters("d", "2")

        print(f"{total} chapters reversed successfully.")

    def copy_chapter_data(self, no=1, file="chapter"):
        if file == "chapter":
            name = self._chapter_name(no)
            data = self.open_file(name)
        else:
            data = self.open_file(file)

        pyperclip.copy(data)

class start_application:
    def openfile_with_file_name(name, directory=None):
        path = os.path.join(script_dir, f"{name}.txt")
        if directory:
            path = os.path.join(directory, f"{name}.txt")
        if os.path.exists(path):
            os.startfile(path)
        else:
            print("❌ File not found:", name)



def run():
    print(f"-------------- Enter 1 for creat new chapter-------------------")
    print(f"-------------- Enter 2 for chapter word count---------------------")
    print(f"-------------- Enter 3 for chack last line---------------------")
    print(f"-------------- Enter 4 for chapter privue in notped---------------------")
    print(f"-------------- Enter 5 for clear all chapters---------------------")
    print(f"-------------- Enter 6 for edit or copy chapters---------------------")
    print(f"-------------- Enter 7 for revers the chapter creation---------------------")
    print(f"---------------Enter 8 for wordcount with file name-------------------")
    print(f"---------------Enter 9 for delete any file with his name----------------")
    print(f"-------------- Enter f for find the word ------------------->")
    print(f"-------------- Enter r for replace the word ------------------->")
    print(f"-------------- Enter 0 for exit---------------------")

    choice = input('Enter your choice - ')


    while choice != 0:
        if choice.isnumeric():
            choice = int(choice)

        list_of_choies = [0,1,2,3,4,5,7,8,9,"f","r"]

        if choice == 0:
            break

        elif choice == 1:
            parameter = int(input('Enter your parameter - '))
            M = int(input("Enter the number of chapters you want to create - "))
            sorce_file = input("Enter the name of file of 'D' for default file: ")
            chdr = TxtFileFunctions().Chapters_dir
            if chdr == "Empty" or chdr == "":
                path = input("Enter path of diretroy-").replace("\\", "\\\\")
                if not os.path.exists(path):
                    print("Directory does not exist.")
                    return None
                TxtFileFunctions().create_text_file("Chapters_parts_path", path)

            if sorce_file.lower() == "d":
                sorce_file = "textfile"
                Chapters(sorce_file).create_chapter_file(parameter, M)

            elif not(os.path.exists(os.path.join(script_dir, sorce_file+".txt"))):
                print("file not found")
                break

            else:
                addcon = "n"
                remender = "c"
                Chapters(sorce_file).create_chapter_file(parameter, M, addcon, remender)


        elif choice == 2:
            chapter = TxtFileFunctions()
            custom = input("Enter 'o' for costum one chaper word cound or 'a' for all chapters word count - ")
            if custom == "o":
                chapterno = int(input('Enter your chapter nomber - '))
                custom_word_count = TextEditor(chapter.chapter_preview(chapterno))
                print(custom_word_count.wordcount())
            elif custom == 'a':
                print(f"no. of chapters is - {chapter.chapter_count()} and word count - {chapter.all_chapters_wordcount()}")

            else:
                print("invalid choice")
                continue


        elif choice == 3:
            file = input("enter file name - ")
            text = TxtFileFunctions().open_file(file)
            if text == "Empty":
                continue
            parameter = int(input("parameter - "))
            print(TextEditor(text).last_santance(parameter))

        elif choice == 4:
            chapter = TxtFileFunctions()
            choicefile = input("Enter 'C' for open chapter and 'O' for custom file :- ")
            if choicefile.lower() == "o":
                file = input("Enter file name - ")
                start_application.openfile_with_file_name(file)
            elif choicefile.lower() == "c":
                chapterno = int(input('Enter your chapter nomber - '))
                name = f"chapter_{"0"+str(chapterno)}"
                directory = TxtFileFunctions().Chapters_dir
                start_application.openfile_with_file_name(name, directory)
            else:
                print("invalid input")

        elif choice == 5:
            CorD = input("Enter 'c' for clear all chapters or 'd' for delete chapters - ")
            Dchoice = "1"
            if CorD == 'd':
                Dchoice = input("Enter 1 for delete only empty chapter or 2 for delete all chapter: ")
            TxtFileFunctions().clear_all_chapters(CorD, Dchoice)
            print("all chapters are clear")

        elif choice == 6:
            chapter = TxtFileFunctions()
            custom = input("Enter 'o' for costum one chaper edit, 'a' for all chapters edit and 'c' for copy chapter- ")
            if custom == "o":
                chapterno = int(input('Enter your chapter nomber - '))
                text = input("Enter text - ")
                chapter.edit_custom_chapter(chapterno, text)
            elif custom == 'a':
                text = input("Enter text - ")
                chapter.edit_all_chapters(text)

            elif custom == "c":
                no = int(input("Enter the chapter number: "))
                chapter.copy_chapter_data(no)
                print(f"chapter_{no}'s data successfully copied!")

            else:
                print("invalid input")

        elif choice == 7:
            chapter = TxtFileFunctions()
            file_chice = input("Enter D for defoult file and C for costum file: ")
            chapter.reverse_chapters(file_chice)

        elif choice == 8:
            file = TxtFileFunctions()
            name = input("Enter file name - ")
            if file.open_file(name) != "no file found":
                text = TextEditor(file.open_file(name))
                print(text.wordcount())

        elif choice == 9:
            file_name = input("Enter file name that you want to delete - ")
            if file_name == "0":
                print("ok Enter new choice")
            else:
                TxtFileFunctions().delete_file(file_name)

        elif choice == "f":
            file = "textfile"   # input("Enter file name - ")
            word = input("Enter word - ")
            text = TxtFileFunctions().open_file(file)
            if text == "Empty":
                continue
            textclass = TextEditor(text)
            print(textclass.find_word(word))

        elif choice == "r":
            file = "textfile"   # input("Enter file name - ")
            word = input("Enter word - ")
            newword = input("Enter new word - ")
            text = TxtFileFunctions().open_file(file)
            if text == "Empty":
                continue
            textclass = TextEditor(text)
            TxtFileFunctions().create_text_file(file, textclass.replace_word(word, newword))

        elif choice not in list_of_choies:
            choice = input("enter valid choice or 0 for exit - ")
            continue

        choice = input("Enter your choice - ")

def extra_states():
    def creat_chapters(file, parame):
        words = TextEditor(file).wordcount()
        print(words)
        return int(words/parame)

    print(creat_chapters(TxtFileFunctions().open_file("textfile").strip(), 7500))




if __name__ == "__main__":
    # chdr = TxtFileFunctions().Chapters_dir
    # if chdr == "Empty" or chdr == "":
    #     path = input("Enter path of diretroy-").replace("\\", "\\\\")
    #     if not os.path.exists(path):
    #         print("Directory does not exist.")
    #     TxtFileFunctions().create_text_file("Chapters_parts_path", path)
    # TxtFileFunctions().create_text_file("textfile", TxtFileFunctions().open_file("textfile").replace("\n\n", "\n"))
    # Chapters("textfile").create_chapter_file(2500, 3)

    run()

    # TxtFileFunctions().create_text_file("textfile", TxtFileFunctions().open_file("textfile").replace("\n\n", "\n"))
    # Chapters("textfile").create_chapter_file(2500, 3)

