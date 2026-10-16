# TREZURE · המותג (תמצית לשיחה חדשה)

**עודכן:** 16 באוקטובר 2026, 12:00. מקור האמת המלא: `02_Brand/TREZURE_Brand_Book.html`. הטוקנים: `02_Brand/trezure-tokens.json` ו `trezure.css`.

## ההחלטות (15 עד 16.10, שני סבבי ספר מותג)
- **שם:** TREZURE (treasure עם ZUR בפנים). בעברית: טרז'ר. ORGANIZUR נדחה. TREZUR נדחה בגלל Trezor (ארנק קריפטו, סימן רשום בתוכנה).
- **טאגליין:** עברית "יש לך את זה." · אנגלית "You got it." (גם המשפט של OKI בסיום).
- **לוגו:** המילה trezure באותיות קטנות, Poppins Bold, ה z היא זרוע תמנון עם שלושה כפתורי יניקה. בנוי כוקטור ב `build_logo.py` (Poppins מהפונט + נתיב מצויר), לא תמונת AI. 3 צבעים (טורקיז, כהה, לבן) × 2 (אנגלית, דו לשוני) ב `02_Brand/logo`, SVG + PNG 1024 ו 2048. מינימום 90px, מתחת: אייקון OKI.
- **דמות:** OKI, תמנון. טורקיז אחד 0F7B8A עם צל 0B5F6B, עיניים גדולות, ארבע זרועות נראות, בלי קו מתאר. הוא הקול של ה AI. לא מופיע בזמן צילום. קבצים ב Storage `brand/oki/`: `oki-master-clean.png` (שקוף, הדמות הראשית), `oki-silhouette-clean.png` (24 עד 48px), `oki-poses-clean.png` (מצביע, מחזיק, אגודל, מנופף, מחפש, ישן), `oki-expressions-clean.png` (אוקי, חושב, לא בטוח, גאה), `oki-hero.png` (סצנה). צללית וקטורית לשחור לבן קיימת כפונקציה `oki()` ב `03_Labels/build_labels.py` (SVG, viewBox 100). הדמות המלאה עדיין PNG; וקטוריזציה ואנימציות ב backlog.
- **פלטה "מים עמוקים":** רקע F4F8F9, משטח FFFFFF, משטח 2 EAF6F7, קו DCE4E8, טקסט 0F1E2D, משני 5A6B78, עמום 66737F, טורקיז 0F7B8A, טורקיז כהה 0B5F6B, טורקיז בהיר D6EEF0, הצלחה 177249, אזהרה 9A5411, שגיאה C7382E, קראפט C9A571 (איורים בלבד). כל הצמדים מעל 4.5. מצב כהה בשלב 2.
- **צבעי מיקומים (10):** E5484D, F08A24, E0B400, 3FA34D, 1EA5A0, 3B82F6, 6366F1, A855F7, EC4899, 9A6B3F. נקודה, פס, או רקע 16 אחוז עם טקסט כהה. לעולם לא טקסט לבן עליהם.
- **טיפוגרפיה:** Assistant לעברית (700 כותרות, 400 גוף), Poppins לכותרות באנגלית בלבד, Assistant לגוף אנגלי, JetBrains Mono לקודים. סולם 12 / 13 / 14 / 16 / 18 / 20 / 24 / 30 / 40. רצפה 12px. בלי opacity על טקסט.
- **קול (V1, יבש ומדויק):** משפט אחד עד 9 מילים, עובדה ואז שאלה, מספרים לפני מילים, גוף שני, בלי אימוג'י וסימני קריאה. 16 דוגמאות דו לשוניות בספר.
- **אייקונים:** Lucide, קו 2px, צבע אחד. אייקון אפליקציה: פני OKI בלבן על טורקיז (`icons/appicon-final-clean.png`).
- **סאונד (ElevenLabs):** 7 אפקטים (open, capture, found, sorted, question, low-stock, complete) ו 2 קולות (oki-you-got-it, oki-okay-he) ב `02_Brand/sound`. ברירת מחדל: רק capture ו found פועלים.
- **תנועה:** 150 / 240 / 420ms, עקומה cubic-bezier(.2,.8,.2,1), מצמוץ כל 4 עד 7 שניות, רגע גדול פעם ביום, prefers-reduced-motion.
- **תוויות (D27, נבחר 16.10):** כיוון A, פס שחור מלא עם הלוגו trezure בלבן, תוכן בשחור, שוליים 2 מ"מ, QR אמיתי בגובה מלא, קוד מיקום ב JetBrains Mono, צללית OKI כסימן. שום טקסט מתחת ל 2.9 מ"מ. 8 תבניות: item-50x30, item-30x50, loc-40x60, loc-60x40, shelf-50x80, shelf-80x50, cable-12x50 (גם 50×12), round-50. הקוד: `03_Labels/build_labels.py` (HTML ב mm) + `render.mjs` (Playwright, 203dpi). PNG מוכנים ב `03_Labels/png/*-A.png`. דף הסקירה: `03_Labels/TREZURE_Labels_Round2.html`. כיוון B (לבן נקי עם OKI גדול) נדחה אבל הקבצים נשמרו. סבב 1 (כרטיסי ממשק מוקטנים) נדחה: "אין מיתוג, אין ניצול שטח, פונטים קטנים".
- **רכיבים:** `trezure.css` עם טוקנים, כפתורים (ראשי, ghost, quiet), צ'יפים, צ'יפ מיקום, כרטיס, שדה, בועת OKI. רדיוסים 8 / 12 / 16 / 24, מגע 44px.
- **חתימת ZUR:** רק בפוטר ובאודות, "Built by ZUR" עם הלוגו האמיתי מהסקיל. אין שפה של ZUR בתוך המוצר.

## הצינור הטכני לנכסים
- OpenArt (gpt-image-2-5-sunburst, image2image עם OKI master כרפרנס) → Edge Function `assets` ב organizur (ייבוא ל Storage, `key:'white'` מסיר רקע לבן ומחתך) → דלי ציבורי `brand`.
- הסשן לא רואה את התמונות ישירות; צפייה דרך הכרום של גילעד (קישורי Storage) או הדפדפן המובנה.
- הלוגו: `build_logo.py` (fontTools על Poppins מ @fontsource, זרוע z כנתיב). הספר: `build_brand_final.py`. סאונד: ElevenLabs Player MCP שומר ב Downloads\ElevenLabs, ומשם הועתק.

## איך משתמשים במותג בקוד האפליקציה
- לייבא את `trezure.css` כבסיס (CSS variables: `--bg`, `--surface`, `--ink`, `--dim`, `--teal`, `--teal-dark`, `--teal-light`, `--success`, `--warning`, `--danger`, סולם `--fs-*`, רדיוסים `--r-*`, צללים, זמני תנועה). הרכיבים `.tz-btn`, `.tz-btn.ghost`, `.tz-btn.quiet`, `.tz-chip`, `.tz-loc` (עם `--c` לצבע המיקום), `.tz-card`, `.tz-input`, `.tz-label`, `.tz-oki`.
- פונטים: `@fontsource/assistant` (hebrew + latin, 400/600/700), `@fontsource/poppins` (600/700), `@fontsource/jetbrains-mono` (400/500/700). לא Google Fonts בפרודקשן (PWA לא מקוון).
- לוגו: `logo/trezure-logo-teal.svg` בכותרת על בהיר, `trezure-logo-white.svg` על טורקיז. מינימום 90px; מתחת: אייקון OKI.
- OKI: צללית ב 24 עד 48px ליד הודעות, master ב 120+ במצבים ריקים. להעתיק את ה PNG מ Storage ל `public/oki/` בריפו (דרך הדפדפן של גילעד או `curl` ב device_bash לתיקייה ואז stage).
- סאונד: `sound/*.mp3` ל `public/sound/`. ברירת מחדל: capture ו found פועלים.
- אייקוני ממשק: `lucide-react`, גודל 24, stroke 2.
- צבעי מיקומים: 10 הערכים ב `trezure-tokens.json` תחת `location`, בשם ובצבע; לכל `location` בבסיס הנתונים נשמר ה hex.

## מה פתוח
- וקטוריזציה של OKI (SVG) ושלוש אנימציות (מצמוץ, הצבעה, נפנוף).
- פאביקון 32 ו 16 מתוך אייקון האפליקציה.
- עדכון פרק 10 בספר המותג עם תבניות A (כרגע "בעבודה" עם הפניה ל 03_Labels).
- מצב כהה (שלב 2).
