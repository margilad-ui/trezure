# TREZURE · מצב נוכחי

**עודכן:** 16 באוקטובר 2026, 13:30.

## בשורה אחת
**האפליקציה באוויר:** https://margilad-ui.github.io/trezure/ . ספרינט 1 בנוי במלואו (כניסה, מרחב ראשון, צלם, סידור, חיפוש, פריט מינימלי, הגדרות, אודות), הסכמה ב Supabase מלאה, פונקציית `vision` פרוסה. **הצעד הבא: סבב סקירה 1** (גילעד מתקין PWA, נכנס, מזין מפתח Anthropic, מצלם 10 פריטים אמיתיים, מסדר במחשב) ואז תיקונים.

## מה קיים

| רכיב | מצב | איפה |
|---|---|---|
| **אתר חי** | GitHub Pages דרך Actions, פריסה אוטומטית ב push ל main | https://margilad-ui.github.io/trezure/ |
| **ריפו** | `margilad-ui/trezure`, ציבורי, אפליקציית Claude מותקנת, push עובד מהסשן | https://github.com/margilad-ui/trezure |
| **אפליקציה** | Vite 8 + React 18 + TS, PWA (autoUpdate), i18n he/en מלא, ראוטר משלנו, 9 מסכים, תור לא מקוון ב IndexedDB, הקטנה ל 1600 WebP בדפדפן | `src/` |
| **סכמה** | 14 טבלאות, RLS על כולן, 10 פונקציות, 2 טריגרים, 10 אינדקסים, דלי `images` עם מדיניות העלאה. מתועד ב `supabase/migrations/0001_schema.sql` | Supabase `organizur` |
| **Edge Functions** | `assets` (גרסה 3, verify_jwt=false), `vision` (גרסה 1, verify_jwt=true) | Supabase |
| **Auth** | Email magic link + OTP (ברירת מחדל). Site URL ו Redirect מכוונים לכתובת החיה. שירות המייל המובנה (מוגבל לכמה מיילים בשעה) | דשבורד |
| מסמכים 00 עד 08 | מעודכנים. העתק ב `docs/` בריפו | `00_Project_Docs`, פרויקט claude.ai, ריפו |
| מותג | סגור (07). PNG של OKI ואייקון יורדים מ Storage בזמן הבנייה | `02_Brand`, Storage `brand` |
| תוויות | כיוון A, 8 תבניות בקוד, עדיין לא באפליקציה (ספרינט 2) | `03_Labels` |
| גיבוי קוד | `04_App/trezure-src-sprint1.zip`, `04_App/0001_schema.sql` | תיקיית הפרויקט |
| מפתח Anthropic | **טרם הוזן.** מסך הגדרות → מפתח Anthropic → נשמר ל `secrets` דרך RPC | |
| Light-The-Spark, zur-social-portal | ב Archive, מורדמים | |

## מה בנוי במסכים (ספרינט 1)
- **כניסה:** מייל → קישור או קוד (שניהם), בחירת שפה, Built by ZUR.
- **ברוך הבא:** שם המרחב → `create_workspace` RPC + 3 אתרים (HM ירוק, OF טורקיז, ST חום) + 13 קטגוריות (10 ראשיות, Cricut וסובלימציה עם תתי קטגוריות) עם שדות.
- **צלם:** עדשה אחורית ראשית (סינון ultra/tele לפי label), מיקוד רציף, LocChip דביק (localStorage) עם בוחר (אחרונים, הכל, יצירת מיקום חדש עם קוד אוטומטי), עינית 1:1 עם רשת שלישים, הנחיה, צמצם 72px, "+ זווית", "× כמות", מונה עם צללית OKI, 6 אחרונים, מחוון "n ממתינים", מצב לא מקוון. רווח/Enter מצלמים במחשב. גיבוי: input file capture כשאין getUserMedia.
- **תור:** `queue.ts` ב IndexedDB (idb-keyval). עלייה בסדר: upsert item (id מהלקוח) → upload webp + thumb → item_images → image_jobs(analyze) → invoke vision. 3 ניסיונות, שגיאה נשמרת.
- **סידור:** קבוצות לפי מיקום ויום, כרטיס עם תמונה (זום), שדות מהצעת OKI (name, brand, category, location, שדות הקטגוריה, qty, unit, kind), ביטחון נמוך = רקע טורקיז בהיר, בועת OKI (מציע / לא בטוח / לצלם שוב / מנתח / שגיאה + "נתח שוב"), אזהרת "אין מפתח". Enter מאשר, Tab, חיצים, Esc, `/` לקטגוריה. בחירה מרובה: קטגוריה/מיקום/סוג לכולם, אשר נבחרים. Polling כל 3 שניות כשיש ניתוח בתהליך. צלילי sorted ו complete.
- **חיפוש (בית):** שדה אחד (wfts prefix + ilike), צ'יפים: קטגוריה, מיקום, סוג, מלאי, "בסידור". רשימה / רשת / טבלה (מחשב, עם מיון). +1/−1 דרך `adjust_qty`. ריק: OKI 140 + "צלם". תוצאה אחת: צליל found.
- **פריט (מינימלי):** גלריה, כל השדות, +/−, מינימום למתכלה, הערות, "מה OKI ראה", ארכוב.
- **הגדרות:** שפה, שם מרחב, מפתח Anthropic (RPC, מוצג רק "יש/אין"), 5 מתגי צליל, גרסה.
- **אודות / עוד:** לוגו, OKI, טאגליין, Built by ZUR (ZUR-black-lockup אם קיים ב `public/zur/`, אחרת טקסט).

## כתובות ומזהים
- אפליקציה: `https://margilad-ui.github.io/trezure/`
- Supabase URL: `https://tkacgqckejabgnlzdujx.supabase.co` · מפתח ציבורי: `sb_publishable_nE1QcO899dA7z-44kmOaRQ_bzty2MvC` (ב `.env.production`)
- Storage ציבורי: `.../storage/v1/object/public/brand/<path>` ו `.../public/images/{ws}/{item}/{img}.webp`
- פונקציות: `.../functions/v1/assets`, `.../functions/v1/vision` (POST `{job_id}` עם JWT)
- OpenArt פרויקט: `30ZkX7kFmD2sk6vbeyfz`

## מה אושר על ידי גילעד (המשך)
… · "רוץ" על ספרינט 1 (16.10 11:51) · יצירת הריפו דרך הכרום שלו · התקנת אפליקציית Claude על הריפו.
