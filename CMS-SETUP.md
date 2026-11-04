# הגדרת ניהול מאמרים (Decap CMS)

## איך זה עובד

1. עורכים מאמר ב-`/admin/` (Decap CMS). המאמר נשמר כקובץ Markdown ב-`content/articles/`, והשמירה נעשית ישירות ל-GitHub.
2. GitHub Action (`.github/workflows/build-articles.yml`) מריץ את `scripts/build-articles.mjs`.
3. הסקריפט יוצר דף HTML מלא ב-`posts/<קטגוריה>/<url_slug>.html`, באותו עיצוב כמו שאר המאמרים, ומעדכן את רשימת "מאמרים חדשים" ב-`posts/Articles.html`.
4. ה-Action שומר את הדפים שנוצרו בחזרה ל-`main`. אם מאמר נמחק או סומן כטיוטה, הדף שנוצר ממנו מוסר.

## הגדרה חד-פעמית

### 1. מאגר GitHub
הפרויקט עדיין לא מאגר git. צריך לדחוף אותו ל-GitHub (ענף `main`), ולעדכן את `admin/config.yml`:
```yaml
repo: OWNER/REPO            # למשל: zivk/milhemet-tora
base_url: https://...        # כתובת ה-OAuth proxy (ראו שלב 3)
```

### 2. OAuth App ב-GitHub
GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
- Authorization callback URL: הכתובת של ה-OAuth proxy (ראו שלב 3).
- שמרו את ה-Client ID וה-Client Secret.

Decap עם GitHub דורש שרת OAuth קטן שמחליף את הקוד בטוקן. אפשר להשתמש בפרוקסי מוכן כמו `decap-proxy` (Cloudflare Worker / Vercel), או בכל פתרון אחר שמממש את זרימת OAuth של Decap.

### 3. פריסת ה-OAuth proxy
הגדירו את משתני הסביבה `OAUTH_CLIENT_ID` ו-`OAUTH_CLIENT_SECRET` בשרת, ועדכנו את `base_url` ב-`admin/config.yml` לכתובת שלו.

### 4. אתר סטטי
אפשר לפרסם את האתר ב-GitHub Pages (ענף `main`, תיקיית השורש). ודאו שהכתובת `/admin/` נגישה.

### 5. בדיקה
היכנסו ל-`/admin/`, התחברו עם GitHub, ונסו להוסיף מאמר.

## הוספת מאמר חדש
1. ב-`/admin/` בחרו **מאמרים → חדש**.
2. מלאו: כותרת, כתובת הדף (אנגלית, ללא רווחים, למשל `rambam-and-tzedaka`), קטגוריה, תיאור קצר, תאריך.
3. כתבו את התוכן. לתמונה: העלו דרך הכפתור Image, והתמונה תישמר ב-`assets/uploads/`.
4. לשמירה כטיוטה סמנו "טיוטה". לפרסום השאירו לא מסומן ולחצו **Publish**.
5. תוך דקה-שתיים ה-Action מסיים, והמאמר מופיע ב-`posts/Articles.html`.

## פיתוח מקומי
```bash
npm install
npm run build:articles
```

## הערות
- מאמרים שנוצרו דרך ה-CMS הם תמיד דפי `posts/<קטגוריה>/<url_slug>.html`. אל תערכו אותם ידנית, כי כל בנייה תדרוס את השינויים. ערכו את המאמר ב-CMS.
- המאמרים הישנים (ה-HTML הקיים) לא נגעו בהם. הבנייה מסרבת לדרוס קובץ שלא נוצר על ידיה, ותודיע אם כתובת שבחרתם תתנגש בקובץ קיים.
- תצוגה מקדימה ב-CMS מציגה את העיצוב בערך; הדף הסופי נבנה מחדש על ידי הסקריפט.
