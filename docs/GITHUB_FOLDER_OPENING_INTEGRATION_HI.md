# GitHub main के folder-opening बदलावों का स्थानीय integration

दिनांक: 10 नवंबर 2026। स्रोत commit: `505b80d783f688e97396a341457d998b08f84ee3` — Fix workspace folder connection and open project library।

Remote main के बदलाव current working files और पुराने HEAD के साथ three-way merge से जोड़े गए। पहले से चल रहे storage/database changes तथा docs folder व्यवस्था सुरक्षित रखी गई। Git HEAD को reset/rebase नहीं किया गया।

शामिल बदलाव:

- नए या existing workspace के लिए सही निर्देश।
- Workspace drag/drop targets और उनका styling।
- Folder permission के लिए explicit Allow folder editing button; browser request उसी click से निकलती है।
- Double picker रोकना, cancellation/error feedback और permission retry।
- Folder जुड़ने पर Home project library स्वतः दिखाना; library read failure को folder-selection failure से अलग रखना।
- Upstream के 10 folder-selection tests आयात किए गए।

मौजूदा database integration के साथ आवश्यक adjustments:

- Folder connection से पहले current database text/metadata की durable save पूरी होती है। Failure पर folder load नहीं होता।
- Successful folder connection के बाद database URL parameters साफ होते हैं।
- नए permission controls और explicit folder-drop targets database event guards से उपलब्ध रहते हैं।
- प्रभावित HTML entry points में CSS/JS cache tags अपडेट हैं।

जाँच: 12 folder-selection scenarios सहित सभी 10 frontend test files सफल। Picker approval/denial, cancellation, double click, dropped directory/file, library failure, database flush ordering और failed-save protection जाँचे गए। Browser regression का अंतिम परिणाम नीचे दर्ज है। वास्तविक external Windows picker का interactive acceptance इस automated run से प्रमाणित नहीं है; native folder I/O के लिए मौजूदा OPFS checks अलग हैं।

Chrome regression पूर्णतः सफल: चार pages load हुए; Local file write/read/reopen/delete, Database offline save/reconnect, metadata/recovery, staged large saves, merge और Sync refresh पहले की तरह चले। `git diff --check` सफल है।
