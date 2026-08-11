# लेखक मंच (Lekhak Manch)

लेखक मंच एक **local-first browser writing studio** है। यह कहानी, उपन्यास और समाचार लेख लिखने के लिए workspace-based interface देता है। Project की वास्तविक सामग्री user द्वारा चुने गए local folder में JSON और TXT files के रूप में सुरक्षित होती है।

यह project plain HTML, CSS और JavaScript पर बना है। इसमें build tool, JavaScript framework या backend server आवश्यक नहीं है।

## मुख्य सुविधाएँ

- Story और Novel project creation
- Parts, chapters और drafts management
- Autosave और manual save
- Chapter edit recovery
- Draft trash, restore और permanent deletion
- Raw तथा advanced draft-to-chapter promotion
- Naming/character/entity database
- Story facts और continuity records
- Notes और project analytics
- Hindi/Devanagari-aware editor input
- Find, replace और multiple matching modes
- Focus writing mode और configurable auto-scroll
- Smart paste और smart copy settings
- Light, dark, grey, purple, sunset और forest themes
- अलग News Article editor
- Project Details dashboard
- AI Agents monitoring UI prototype

## मुख्य पेज

| पेज | उपयोग |
|---|---|
| `home.html` | Workspace चुनना, नया project बनाना और recent projects खोलना |
| `story-novel-project-editor.html` | Story/Novel का मुख्य writing editor |
| `story-novel-focus-editor.html` | Distraction-free focus editor shell |
| `news-article-editor.html` | News article writing workspace |
| `project-details.html` | Documents, names, facts, notes, changes और graphs |
| `ai-agents.html` | Local project data पर आधारित AI-agent monitor prototype |

## प्रोजेक्ट चलाना

File System Access API के reliable उपयोग के लिए project को `localhost` पर चलाएँ। Chrome या Microsoft Edge recommended हैं।

Python उपलब्ध हो तो project root में:

```powershell
python -m http.server 8000
```

इसके बाद browser में खोलें:

```text
http://localhost:8000/home.html
```

Node.js उपलब्ध हो तो किसी static HTTP server का भी उपयोग किया जा सकता है। उदाहरण:

```powershell
npx serve .
```

> पहली बार workspace चुनते समय browser local folder की read/write permission माँगेगा।

## सामान्य उपयोग

1. `home.html` खोलें।
2. **Choose Folder** से workspace directory चुनें।
3. **New Project** खोलें।
4. Title, author, project type, language और notes भरें।
5. Project create करें।
6. Story/Novel project मुख्य editor में और News project News Desk में खुलेगा।
7. अगली बार **Recent Project** से project दोबारा खोला जा सकता है।

## Local workspace structure

Application workspace में project type के अनुसार folders बनाती है:

```text
Workspace/
├── Novels/
├── Stories/
└── News Articles/
```

एक Story/Novel project का सामान्य layout:

```text
Project Folder/
├── Chapters_info.json
├── Story_Naming.json
├── Story_Drafts.json
├── Temp_Chapter_Draft.json
├── Chapters/
├── Drafts/
├── Edited_Chapter/
├── Trash/
└── .lekhak-manch/
```

News project में article state मुख्यतः `NewsDesk_Articles.json` में रहती है।

## Data storage

Application तीन persistence layers इस्तेमाल करती है:

- **Project files:** Chapters, drafts, naming data और अन्य durable content।
- **IndexedDB:** चुने हुए workspace और active project के directory handles।
- **localStorage:** Theme, editor preferences, active UI state, recovery/cache और fallback data।

Project content को किसी remote server पर भेजने वाला backend वर्तमान codebase में नहीं है। AI-related screens अभी local UI/prompt prototypes हैं; वे किसी LLM API को call नहीं करतीं।

## Source structure

```text
assets/
├── shared/
│   ├── css/                 # Common components और theme overrides
│   └── js/                  # Icons, theme, normalization और persistence
└── pages/
    ├── home/
    ├── story-novel-project-editor/
    ├── news-article-editor/
    ├── project-details/
    └── ai-agents/
```

JavaScript ES modules में bundled नहीं है। Scripts HTML में numeric order के अनुसार load होती हैं और shared global functions/state इस्तेमाल करती हैं। Script order बदलने से पहले dependencies की जाँच करें।

## विस्तृत तकनीकी दस्तावेज़

पूरे architecture, data models, storage behavior, end-to-end flows, function families, limitations और developer change guide के लिए देखें:

[PROJECT_ARCHITECTURE_AND_WORKING_HI.md](./PROJECT_ARCHITECTURE_AND_WORKING_HI.md)

## Browser compatibility

- Recommended: नवीन Chrome या Microsoft Edge
- Local folder access के लिए File System Access API आवश्यक है
- Unsupported browser में workspace selection और direct file saving काम नहीं कर सकते
- `localhost` या secure context का उपयोग करें

## Development notes

- Source बदलने के बाद Story, Novel और News तीनों project types manually verify करें।
- Persistence changes को पुराने project files के साथ test करें।
- User-controlled text को HTML template में डालने से पहले escape करें।
- Chapter, draft या project delete operations के paths को विशेष सावधानी से बदलें।
- बड़े editor controllers global state पर निर्भर हैं; function/file load order को सुरक्षित रखें।

## वर्तमान स्थिति

यह repository एक frontend/local-file application है। इसमें automated test suite, build pipeline, package manifest और production deployment configuration मौजूद नहीं हैं। विस्तृत technical-debt notes architecture document में उपलब्ध हैं।
