# TREZURE · תוכנית בנייה, ספרינט 1

**עודכן:** 16 באוקטובר 2026, 12:00. המסמך הזה הוא ההוראות לקלוד בשיחת הבנייה הראשונה. הכל פה כבר הוחלט (01, 02, 07); אין צורך לפתוח דיונים מחדש. אחרי "לך" מגילעד: לבצע לפי הסדר, לעדכן אותו אחרי כל צעד, ולשאול רק כשאין ברירה.

## היעד של הספרינט
גילעד עומד מול מדף עם הטלפון, בוחר מיקום, מצלם 10 פריטים ב 50 שניות, עובר למחשב, ורואה אותם ב"סידור" עם הצעות של OKI (שם, מותג, קטגוריה, שדות). מאשר ב Enter, והם מופיעים בחיפוש. הכל באוויר ב GitHub Pages, מותקן כ PWA באנדרואיד, במותג TREZURE.

## 0. סדר הצעדים
1. ריפו ושלד (סעיף 1). 2. סכמה (2). 3. פריסה ראשונה עם מסך כניסה (3). 4. seed (4). 5. מסך צלם (5). 6. פונקציית vision (6). 7. מסך סידור (7). 8. מסך חיפוש (8). 9. הגדרות ופוטר (9). 10. סבב סקירה (10).
לדחוף אחרי כל צעד שעובד. `npm run build` ירוק לפני כל push.

## 1. ריפו ושלד

**ריפו:** `margilad-ui/trezure`, ציבורי (Pages חינם), branch `main`. קודם `gh repo create margilad-ui/trezure --public --source=. --push`; אם חוזר 403 או חסום: לפתוח `https://github.com/new` בכרום של גילעד, למלא, וליצור. אחרי היצירה גילעד מתקין את אפליקציית Claude על הריפו (לחיצה אחת), ורק אז `git push` עובד.

**מבנה:**
```
trezure/
  index.html                 lang="he" dir="rtl", theme-color #0F7B8A, manifest
  vite.config.ts             base '/trezure/', vite-plugin-pwa (registerType autoUpdate), spa404 (404.html = index.html)
  .env.production            VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (ציבורי, לא סוד)
  .github/workflows/deploy.yml   npm ci, npm run build, actions/upload-pages-artifact, actions/deploy-pages
  public/                    icons (מ appicon-final-clean.png: 192, 512, maskable), oki/*.png, sound/*.mp3, logo/*.svg
  src/main.tsx               React 18, StrictMode, Router
  src/styles/trezure.css     העתק של 02_Brand/trezure.css + תוספות
  src/i18n/he.ts, en.ts, index.ts   מילון, t(), useT(), setLang(), applyDir()
  src/lib/supabase.ts        createClient, טיפוסים מ generate_typescript_types
  src/lib/api.ts             שאילתות: items, locations, categories, inbox, upload
  src/lib/queue.ts           תור לא מקוון (IndexedDB דרך idb-keyval): צילומים שממתינים להעלאה
  src/lib/image.ts           הקטנה ל 1600px WebP ב canvas, thumb 320
  src/components/            Logo, Oki (variant: silhouette|master, size), LocChip, Pic, Toast, Scanner (ספרינט 2)
  src/screens/Login.tsx, Capture.tsx, Inbox.tsx, Search.tsx, Settings.tsx, About.tsx
  src/App.tsx                ניווט: תחתון בטלפון (צלם, חיפוש, סידור, עוד), עליון במחשב
  supabase/migrations/0001_schema.sql   תיעוד הסכמה שהורצה ב execute_sql
  supabase/functions/vision/index.ts
  docs/                      העתק של 00 עד 08
```

**חבילות:** react, react-dom, @supabase/supabase-js, idb-keyval, lucide-react, @fontsource/assistant, @fontsource/poppins, @fontsource/jetbrains-mono, vite-plugin-pwa, typescript, vite, @vitejs/plugin-react.

**ראוטר:** קטן משלנו על history API (כמו בחנות הלגו: `router.ts` עם BASE, navigate, href, useRoute). לא react-router (משקל, ו base path של Pages).

**מילון:** אובייקט שטוח `{ 'capture.title': 'צלם', ... }` ב he ו en, `t(key)`; שפה ב localStorage; `applyDir()` משנה `dir` ו `lang` על html. כל מחרוזת בממשק דרך `t`. Poppins לכותרות רק כש lang=en (`:lang(en) h1` ב CSS).

**PWA:** manifest: name "TREZURE", short_name "TREZURE", id "/trezure/", display standalone, background F4F8F9, theme 0F7B8A, אייקונים 192/512 + maskable. Service worker autoUpdate. אחרי פריסה: רענון אחד.

## 2. סכמה (execute_sql, רק הוספות, בקריאות נפרדות)

סדר: הרחבות ← טבלאות ← פונקציות ← מדיניות (כל טבלה בקריאה נפרדת ממדיניותה) ← אינדקסים ← דלי.

```sql
create extension if not exists pgcrypto;  -- gen_random_uuid

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(), name text not null, slug text unique,
  kind text not null default 'home' check (kind in ('home','business','org')),
  locale text not null default 'he', created_by uuid references auth.users(id), created_at timestamptz default now());

create table if not exists members (
  workspace_id uuid references workspaces(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','editor','viewer')),
  perms jsonb not null default '{"can_add":true,"can_edit":true,"can_delete":false,"can_export":true,"can_print":true,"categories":null}',
  invited_email text, joined_at timestamptz default now(), primary key (workspace_id, user_id));

create table if not exists locations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces(id) on delete cascade,
  parent_id uuid references locations(id), kind text not null check (kind in ('site','room','cabinet','shelf','box','drawer','other')),
  name text not null, code text not null, color text, sort int default 0, photo_path text, path text, created_at timestamptz default now(),
  unique (workspace_id, code));

create table if not exists categories (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces(id) on delete cascade,
  parent_id uuid references categories(id), name_he text not null, name_en text, icon text,
  default_unit text default 'unit', default_kind text default 'equipment' check (default_kind in ('equipment','consumable')),
  fields jsonb not null default '[]', sort int default 0);

create table if not exists items (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces(id) on delete cascade,
  name text, brand text, category_id uuid references categories(id), location_id uuid references locations(id),
  qty numeric not null default 1, unit text not null default 'unit',
  kind text not null default 'equipment' check (kind in ('equipment','consumable','kit')),
  stock_state text not null default 'full' check (stock_state in ('full','low','empty')), min_qty numeric,
  condition text check (condition in ('new','good','worn','broken')), barcode text, tags text[] default '{}',
  attrs jsonb not null default '{}', notes text, price numeric, currency text default 'ILS',
  cover_image_id uuid, stage text not null default 'inbox' check (stage in ('inbox','ready')), ai jsonb,
  search tsvector generated always as (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(notes,'') || ' ' || coalesce(barcode,'') || ' ' || array_to_string(tags,' '))) stored,
  created_by uuid references auth.users(id), created_at timestamptz default now(), updated_at timestamptz default now(), archived_at timestamptz);

create table if not exists item_images (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade, path_original text not null, path_clean text, path_thumb text,
  source text not null default 'camera' check (source in ('camera','lens','generated','upload')),
  angle text default 'front' check (angle in ('front','side','back','detail')), sort int default 0, width int, height int, created_at timestamptz default now());

create table if not exists image_jobs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces(id) on delete cascade,
  item_id uuid references items(id) on delete cascade, image_id uuid references item_images(id) on delete cascade,
  type text not null check (type in ('analyze','lens','clean','generate','barcode')),
  status text not null default 'pending' check (status in ('pending','running','done','error','needs_reshoot')),
  request jsonb, result jsonb, error text, created_at timestamptz default now(), updated_at timestamptz default now());

create table if not exists activity (id bigserial primary key, workspace_id uuid not null, item_id uuid, user_id uuid, action text not null, diff jsonb, created_at timestamptz default now());
create table if not exists label_templates (id uuid primary key default gen_random_uuid(), workspace_id uuid, name text, width_mm numeric, height_mm numeric, dpi int default 203, layout jsonb, is_default boolean default false);
create table if not exists settings (workspace_id uuid references workspaces(id) on delete cascade, key text, value jsonb, primary key (workspace_id, key));
create table if not exists secrets (workspace_id uuid references workspaces(id) on delete cascade, key text, value text, primary key (workspace_id, key));
create table if not exists barcode_cache (barcode text primary key, data jsonb, source text, fetched_at timestamptz default now());
create table if not exists kit_items (kit_id uuid references items(id) on delete cascade, item_id uuid references items(id) on delete cascade, qty numeric default 1, primary key (kit_id, item_id));
create table if not exists loans (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, item_id uuid references items(id), qty numeric default 1, to_name text, purpose text, out_at timestamptz default now(), due_at timestamptz, returned_at timestamptz, notes text, created_by uuid);
```

**פונקציות RLS:**
```sql
create or replace function is_member(ws uuid) returns boolean language sql stable security definer as
$$ select exists (select 1 from members where workspace_id = ws and user_id = auth.uid()) $$;
create or replace function can_do(ws uuid, perm text) returns boolean language sql stable security definer as
$$ select coalesce((select (perms->>perm)::boolean from members where workspace_id = ws and user_id = auth.uid()), false) $$;
```

**מדיניות (דוגמה ל items; אותו דגם לשאר, בשמות ייחודיים):**
```sql
create policy items_select on items for select using (is_member(workspace_id));
create policy items_insert on items for insert with check (can_do(workspace_id,'can_add'));
create policy items_update on items for update using (can_do(workspace_id,'can_edit'));
-- אין delete. ארכוב = update archived_at.
-- workspaces: select לחברים; insert לכל משתמש מחובר (created_by = auth.uid()).
-- members: select לחברים; insert: הבעלים של המרחב, או המשתמש עצמו כשהוא יוצר מרחב (trigger שמוסיף owner אוטומטית אחרי insert ל workspaces).
-- secrets: select/insert/update רק ל role owner.
-- barcode_cache: select לכל מחובר, insert לכל מחובר.
```
RLS כבר מופעל אוטומטית על טבלאות חדשות ב public (טריגר בפרויקט). טבלה בלי מדיניות = חסומה. לבדוק עם `get_advisors` אחרי הסכמה.

**טריגר:** אחרי insert ל workspaces: insert ל members (owner, המשתמש היוצר). עוד טריגר: `updated_at` ב items.

**אינדקסים:** `items(workspace_id, stage)`, `items using gin(search)`, `items(location_id)`, `items(category_id)`, `locations(workspace_id, parent_id)`, `image_jobs(status)`.

**Storage:** דלי `images` ציבורי לקריאה (`insert into storage.buckets (id,name,public) values ('images','images',true) on conflict do nothing`). העלאה: מדיניות על storage.objects הייתה חסומה בלגו מה MCP; אם חסום, העלאה דרך Edge Function `upload` עם service role, או דרך הדשבורד בכרום (Storage → Policies). לנסות קודם SQL.

**Auth:** ברירת המחדל של פרויקט חדש היא קישור במייל (magic link). לבדוק בדשבורד Authentication → URL Configuration: Site URL `https://margilad-ui.github.io/trezure/`, Redirect URLs אותו דבר. אם מגיע קוד במקום קישור (כמו בלגו), לתמוך בשניהם במסך הכניסה.

## 3. פריסה ראשונה
Login screen בלבד, מותג מלא (לוגו, רקע F4F8F9, OKI מנופף), כדי לוודא Pages, PWA ו Auth לפני שבונים מסכים. Pages: Settings → Pages → Source: GitHub Actions (דרך הכרום של גילעד אם ה API חסום). הריצה הראשונה של deploy-pages נכשלת עד שזה מופעל.

## 4. Seed (אחרי כניסה ראשונה של גילעד)
מסך "ברוך הבא": יצירת מרחב "הבית של גילעד" (kind home), ואז insert של:
- **אתרים:** בית (HM), משרד (OF), מחסן (ST). צבעים: בית ירוק 3FA34D, משרד טורקיז 1EA5A0, מחסן חום 9A6B3F.
- **קטגוריות עם שדות:** Cricut (ויניל: צבע, רוחב ס"מ, אורך מ', סוג [רגיל, HTV, גליטר]; להבים; מחצלות), סובלימציה (דיו: צבע, נפח; נייר; מוצרים ריקים: סוג, צבע), ציוד סדנאות, ציוד יצירה, משחקי חברה (שחקנים, גיל, זמן דקות), פאזלים (חלקים, גיל), משחקי הרכבה, ציוד משרדי, מתנות, אחר. כל קטגוריה עם `name_en`, אייקון Lucide, יחידה וסוג ברירת מחדל (מתכלה: ויניל, דיו, נייר, מוצרים ריקים, ציוד משרדי).
- **הגדרות:** lang he, sounds {capture:true, found:true}.

## 5. מסך צלם (Capture.tsx)
- `getUserMedia` עם `facingMode: {ideal:'environment'}`, בחירת העדשה הראשית כמו בסורק של הלגו (לא ultra-wide), מיקוד רציף אם נתמך.
- למעלה: `LocChip` של המיקום הנוכחי (צבע, קוד, שם), לחיצה פותחת בוחר: אחרונים, חיפוש בעץ. נשמר ב localStorage.
- אמצע: עינית ריבועית (aspect 1:1, רוחב 92vw), מתחתיה שורת הנחיה אחת מ `t('capture.hint')`.
- צמצם 72px, טורקיז. לחיצה: צילום ל canvas, חיתוך לריבוע, הקטנה ל 1600 WebP (איכות .85) + thumb 320, רטט 30ms, צליל capture, הבזק לבן 120ms, מונה עולה (scale 1.15 ← 1).
- "+ זווית": מוסיף תמונה לפריט האחרון (angle side). "× כמות": 1, 2, 5, 10 או מספר; ברירת מחדל 1.
- **תור:** כל צילום נשמר ב IndexedDB (`queue.ts`: {id, blob, thumb, location_id, qty, item_id?}). worker בדפדפן מעלה ברקע כשיש רשת: insert items (stage inbox, location, qty) → upload ל `images/{ws}/{item}/{uuid}.webp` → insert item_images → insert image_jobs (analyze, pending) → קריאה ל `vision`. מחוון "3 ממתינים".
- שורת "אחרונים" בתחתית: 6 ממוזערים אחרונים.
- OKI לא מופיע. רק צללית 24px ליד המונה.

## 6. Edge Function `vision`
- `deploy_edge_function` בשם `vision`, verify_jwt=true (נקרא מהאפליקציה עם JWT של המשתמש).
- קלט: `{ job_id }`. הפונקציה טוענת את העבודה, את התמונה (כתובת ציבורית מ Storage), את הקטגוריות של המרחב (name_he, name_en, fields), ואת המפתח מ `secrets` (key `anthropic`) של אותו מרחב.
- קריאה ל Claude (model: claude-sonnet-4-5 או החדש ביותר שזמין, `max_tokens 800`) עם התמונה ו prompt שמבקש JSON בלבד:
  `{name_he, name_en, brand, category_id (מתוך הרשימה) , attrs {key:value לפי שדות הקטגוריה}, qty_guess, unit, barcode_digits, is_branded_product, confidence 0..1, needs_reshoot: {angle, reason_he} | null}`
- שומר: `items.ai = result`, `image_jobs.status = done | needs_reshoot`, ואם confidence מעל .85 ממלא גם name/brand/category/attrs (עדיין stage inbox; גילעד מאשר).
- שגיאה: status error + error text. אין מפתח: status error "no_key" והמסך מציע להזין בהגדרות.
- עלות: 1 עד 2 אגורות לתמונה.

## 7. מסך סידור (Inbox.tsx)
- רשימת items ב stage inbox, מקובצים לפי location ויום. כותרת קבוצה: "משרד · ארון 3 · היום 14:20 · 23 פריטים".
- כרטיס: תמונה (thumb, לחיצה מגדילה), שדות: שם, מותג, קטגוריה (select), שדות הקטגוריה (לפי fields), כמות + יחידה, סוג (ציוד/מתכלה). ממולאים מ `items.ai`. ביטחון מתחת ל .6: רקע השדה טורקיז בהיר. `.tz-oki` עם המשפט: "נראה לי {name}, {brand}. נכון?" (V1).
- **מקלדת:** Enter מאשר (stage ready, activity create) ועובר לבא. Tab בין שדות. חיצים בין כרטיסים. Esc מדלג. `/` פותח חיפוש קטגוריה.
- בחירה מרובה (checkbox): קטגוריה, מיקום, סוג, תגית לכל הנבחרים.
- "לצלם שוב": פריטים עם needs_reshoot מסומנים; ההודעה של OKI: "צלם את הצד עם הכיתוב, לא קראתי."
- מיזוג: גרירה של כרטיס על כרטיס → פריט אחד עם שתי תמונות (ספרינט 2 אם לא נכנס).
- צליל sorted באישור. סיום קבוצה: "23 סודרו. 4 מחכים לך." + OKI גאה + צליל complete.
- יעד: 10 פריטים בדקה.

## 8. מסך חיפוש (Search.tsx, דף הבית)
- שדה אחד למעלה, `tsvector` + ilike על name/brand; תוצאות תוך כדי הקלדה (debounce 150ms).
- סינונים כצ'יפים: קטגוריה, מיקום, סוג, מצב מלאי, "ב inbox".
- טלפון: רשימה (thumb 64, שם, כמות, LocChip). מחשב (מעל 900px): טבלה (תמונה, שם, מותג, קטגוריה, מיקום, כמות, מצב, עודכן) עם מיון. תצוגת רשת (תמונות גדולות) בשניהם.
- כל שורה: לחיצה לדף פריט (ספרינט 2: גרסה מינימלית עכשיו: תמונה, שדות, +/−, הזז), כפתורי +1/−1 (activity qty).
- ריק: OKI master 140px, "אין פה כלום עדיין. צלם משהו." וכפתור "צלם".
- חיפוש שמצא תוצאה אחת: צליל found.

## 9. הגדרות, פוטר, אודות
- Settings: שפה (he/en), מפתח Anthropic (נשמר ל `secrets` דרך RPC או insert מוגן ב RLS, מוצג כ ••••), צלילים (מתגים), מרחב (שם).
- About: הלוגו, "יש לך את זה.", גרסה, "Built by ZUR" עם `ZUR-black-lockup` (PNG מהסקיל, מועתק ל public/zur/).
- פוטר (מחשב) ומסך "עוד" (טלפון): קישורים + "Built by ZUR" קטן.

## 10. סבב סקירה
1. גילעד מתקין את ה PWA באנדרואיד, נכנס, יוצר מרחב.
2. מצלם 10 פריטים אמיתיים מול מדף אחד.
3. במחשב: סידור, אישור, חיפוש.
4. שולח צילומי מסך ומשפטים. קלוד מתקן הכל בסבב אחד ומעלה, עם "מה השתנה".
5. עדכון 02 (החלטות), 03 (תקלות), 04, 05 בתיקייה ובפרויקט.

## דברים שלא לשכוח
- `base: '/trezure/'` ב vite ו `BASE` בראוטר. 404.html = index.html.
- `overflow-x: hidden` על html, `min-width: 0` על ילדי grid, מאפיינים לוגיים בלבד.
- מגע 44px מינימום. שום טקסט מתחת ל 12px. בלי opacity על טקסט.
- כל טקסט דרך `t()`. בלי מקפים ארוכים גם במחרוזות המילון.
- OKI: משפט אחד. מספרים לפני מילים. בלי סימני קריאה.
- לדחוף אחרי כל צעד; הסשן יכול להתאפס.
- לתעד כל שינוי סכמה ב `supabase/migrations/0001_schema.sql` ובהערה.
