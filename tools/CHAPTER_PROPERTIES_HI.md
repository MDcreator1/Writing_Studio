# चैप्टर TXT की Windows Properties और इंडेक्स रिकवरी

यह वैकल्पिक helper प्रत्येक chapter TXT की `LekhakChapter` नाम वाली NTFS ADS में स्थायी UUID, part, वर्तमान क्रम, पहली बार सुरक्षित किया गया क्रम, शीर्षक और SHA-256 hash रखता है। कहानी का मुख्य TXT पाठ नहीं बदलता। यह Windows Explorer के सामान्य Details पैनल में नए फ़ील्ड नहीं जोड़ता।

## शुरू करें

Windows और Python 3.12 या नया संस्करण चाहिए। `tools/start-chapter-properties.cmd` खोलें और **वही नॉवेल फ़ोल्डर चुनें जिसमें Chapters_info.json और Chapters हैं**। Helper की विंडो खुली रखें। फिर लेखक मंच का नया संस्करण लोड करके प्रोजेक्ट खोलें। सामान्य सेव और क्रम बदलकर सेव करने पर Properties का अनुरोध स्वतः जाएगा।

या repository folder से:

```powershell
python tools/chapter_properties_helper.py watch --project "C:\path\to\Novel"
```

Helper पहली बार मौजूदा इंडेक्स जाँचता है। पहले से सुरक्षित पहचान वाला चैप्टर बाहर से डिलीट हो तो नीचे दी गई प्रक्रिया से उसका सक्रिय रिकॉर्ड हटता है। बिना सुरक्षित पहचान के गायब फ़ाइल या बिना इंडेक्स की TXT मिलने पर वह अनुमान नहीं लगाता। **पुराने गलत शीर्षक/क्रम जिन्हें पहचानने के लिए कोई पूर्व मेटाडेटा नहीं है, उन्हें यह अनुमान से सही नहीं कर सकता।** पहले सही आधार-इंडेक्स स्थापित करना आवश्यक है।

Advanced Developer Settings के Initial Rendering Snapshot Builder में **Check Properties Status** से नतीजा देखें। TXT save और Properties acknowledgment अलग हैं; helper बंद होने/त्रुटि आने पर TXT का सामान्य save जारी रहता है। Helper metadata failure अगली save पर या status button से दिखाई देती है।

## क्या सुरक्षित होता है

- हर TXT की ADS में स्थायी ID, मूल/वर्तमान क्रम, chapter/part/project metadata और hash।
- प्रोजेक्ट की `.chapter-properties/index-backup.json` में अंतिम सुरक्षित पूरा इंडेक्स और उन्हीं IDs की कॉपी। यह हर TXT के साथ अलग JSON sidecar नहीं है।
- बदलाव होने पर `index-previous.json` में पिछली कॉपी। सेव के संकेत और स्थिति भी इसी helper फ़ोल्डर में रहते हैं।

ब्राउज़र की atomic file replacement में ADS हट सकती है; backup से उसी chapter ID की Properties दोबारा लिखी जाती हैं। Helper सिर्फ editor द्वारा सेव के रूप में चिह्नित TXT के बदले हुए hash स्वीकार करता है। बाहरी बदलाव मिलने पर पहले उस chapter की समीक्षा करके editor में save करें।

## बाहर से TXT डिलीट होने पर

चलता helper अब सेव अनुरोध के बिना भी Chapters folder जाँचता है। पहले से पहचानी गई TXT लगातार लगभग 3 सेकंड गायब हो और सूची स्थिर हो तो उसका सक्रिय रिकॉर्ड `Chapters_info.json` और वर्तमान Properties backup से हट जाता है। हर part तथा raw chapters में `no` फिर 1, 2, 3… होता है और बची हुई TXT की ADS में वर्तमान `order`/`globalOrder` अपडेट होते हैं। स्थायी ID और पहली बार सुरक्षित किया गया ऐतिहासिक क्रम नहीं बदलते। TXT के नाम या कहानी का पाठ नहीं बदलता।

हटाए चैप्टर के Naming rendering snapshot तथा पुराने Left/Active/Status rendering caches हटते हैं। Story_Naming, Story_Facts और Draft/Trash का मूल डेटा नहीं बदलता। `index-before-deletion.json` में पुराना इंडेक्स केवल ऐतिहासिक रिकवरी कॉपी के रूप में बचता है; सक्रिय सूची में हटाए चैप्टर का रिकॉर्ड नहीं रहता। यह पूरी कहानी का टेक्स्ट बैकअप नहीं है।

Rename/unindexed TXT मिलने, पूरे Chapters folder के गायब या inaccessible होने, संदिग्ध पहचान या अपुष्ट content change पर रिकॉर्ड नहीं हटाया जाता। थोड़ी देर के लिए गायब होकर वापस आई फ़ाइल भी सुरक्षित रहती है। पूरा Chapters folder मौजूद हो और उसकी सभी ज्ञात TXT डिलीट हों तो सूची खाली हो सकती है; part के नाम सुरक्षित रहते हैं।

खुले एडिटर का पुराना autosave डिलीट फ़ाइल या रिकॉर्ड वापस न बनाए, इसके लिए write guards और deletion marker हैं। संदेश मिलने पर प्रोजेक्ट दोबारा खोलें; helper पेज को अपने-आप Reload करके unsaved पाठ नहीं हटाता। नए चैप्टर के लिए बची/हटाई गई फ़ाइलों से अलग नाम चुना जाता है, इसलिए numbering में gap आने से कोई बची TXT overwrite नहीं होती।

## गलत फ़ाइल नाम या इंडेक्स की रिकवरी

पहले helper में Ctrl+C दबाएँ और एडिटर बंद करें। नाम बदलने के बाद गलत इंडेक्स के साथ कहानी को edit/save न करें। पहले preview देखें:

```powershell
python tools/chapter_properties_helper.py recover --project "C:\path\to\Novel"
```

सही mapping मिलने पर लागू करें:

```powershell
python tools/chapter_properties_helper.py recover --project "C:\path\to\Novel" --apply
```

यह TXT के **आख़िरी सुरक्षित नाम** और **आख़िरी सुरक्षित इंडेक्स** वापस रखता है। दूसरे नाम-संदर्भ वाले सिस्टम को बदलने की ज़रूरत नहीं पड़ती। Chapters_info का fingerprint बदलने पर Left Panel cache अगली बार स्वतः अमान्य होता है। फ़ाइल-नामों की अदला-बदली को पहले staging folder में रखकर संभाला जाता है। पुराना manifest और recovery plan उसी helper folder में सुरक्षित रहते हैं; सामान्य exception पर नाम rollback होते हैं। Recovery के बीच process/machine crash हो तो staging folder की TXT फ़ाइलें न हटाएँ; `recovery-*/plan.json` से वापस रखी जा सकती हैं।

पहचान में प्राथमिकता ADS की स्थायी ID को मिलती है। ADS गायब होने पर सिर्फ **एकमात्र exact hash match** स्वीकार होता है। एक जैसे कई पाठ, गायब/अतिरिक्त फ़ाइलें या असुरक्षित बाहरी बदलाव पर apply रुकता है। Backup खो जाए लेकिन सभी ADS बची हों तो उनसे इंडेक्स पुनर्निर्मित हो सकता है; खाली/missing parts या मिश्रित save versions के लिए पूरा backup चाहिए।

## Properties पढ़ें

छिपी विंडो में helper चल रहा हो तो `tools/stop-chapter-properties.cmd` खोलकर वही प्रोजेक्ट चुनें। या `python tools/chapter_properties_helper.py stop --project "C:\path\to\Novel"` चलाएँ। इससे कोई असंबंधित process बंद नहीं होगा; helper अपना चालू काम पूरा करके रुकेगा। कंप्यूटर restart के बाद start launcher से helper फिर शुरू करें।

```powershell
Get-Content -LiteralPath "C:\path\to\Novel\Chapters\chapter_01.txt" -Stream LekhakChapter -Encoding UTF8
```

ZIP या ऐसी कॉपी प्रक्रिया जो ADS नहीं बचाती, उसमें `.chapter-properties` का backup भी साथ रखें। NTFS/ADS उपलब्ध न होने पर helper सफलता का दावा नहीं करेगा। किसी crash के कारण `enabled.json` बच जाए और watcher दुबारा न खुले, पहले सुनिश्चित करें कि पुराना helper बंद है, फिर केवल वह stale `enabled.json` हटाएँ।

## सीमित integration

न कोई नेटवर्क पोर्ट, न extension, न background installation। Helper केवल दिए गए project folder में काम करता है। एडिटर सफल manifest save के बाद उसी folder में request लिखता है; helper उसे poll करता है। Drafts, Trash, Facts, Naming का मूल डेटा और कहानी का पाठ इस helper से संशोधित नहीं होते। चैप्टर metadata तथा उसके derived rendering caches ही deletion पर अपडेट होते हैं। Page load के बाद helper न चल रहा हो तो request folder अपने-आप नहीं बनाया जाता।

## जाँच

```powershell
python -B -m unittest discover -s tests -p test_chapter_properties.py -v
node tests/chapter-properties-bridge.test.js
```

तकनीकी आधार: [Microsoft: File Streams](https://learn.microsoft.com/en-us/windows/win32/fileio/file-streams), [MDN: FileSystemFileHandle](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle)।
