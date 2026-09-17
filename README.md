# אגיסטרי — אתר תלת־ממד סינמטי לטיול 12–16.10.2026

אתר Three.js + GSAP ScrollTrigger, עברית ו־RTL מלאים, ללא תלויות מקומיות: three נטען מ־jsdelivr דרך importmap, GSAP מ־cdnjs, הגופן Heebo מ־Google Fonts.

## הרצה

להרצה במחשב ללא שרת וללא התקנות נוספות: הפעילו בלחיצה כפולה את `run-agistri.bat`.
הוא פותח את הקובץ המוכן `dist/index.html`.

### אנדרואיד ו־iPhone

העלו את כל התוכן של `dist` לשירות אחסון סטטי עם כתובת `https://`, למשל Netlify Drop,
GitHub Pages או Cloudflare Pages. לאחר מכן פתחו את הכתובת בטלפון:

- Android/Chrome: תפריט ⋮ ואז `Add to Home screen`.
- iPhone/Safari: כפתור השיתוף ואז `Add to Home Screen`.

ה־HTTPS נדרש עבור WebGL מלא, Service Worker והתקנה כמיני־אפליקציה. אין לשלוח רק את
`index.html`, כי צריך להעלות יחד גם את `manifest.webmanifest` ואת `sw.js`.

לבנייה מחדש אחרי שינוי בקוד:

```bash
npm install
npm run build
```

## מבנה

```
index.html            מעטפת הדף, importmap, GSAP
style.css             עיצוב: זכוכית כהה על ים חי, Heebo, רספונסיבי, reduced-motion
main.js               renderer, EffectComposer (SSAO → Bloom → Afterimage → Output), לולאת אנימציה, צילומי מסך למקומות
components/
  world.js            שדה קו־החוף (metaballs + רעש), גבהים, מקומות, נתיב המעבורת
  content.js          כל תוכן הטיול: ימים, רגעים, פוזות מצלמה, מקומות, שכבת המידע
  environment.js      שמיים, שמש, ערפל, תאורה, שיידר מים
  island.js           אי, יערות אורנים, כפרים, נמלים, מגדלור, פיראוס ואתונה
  actors.js           מעבורת, סירות, שחפים, עננים, נצנוצי ים, מטוס
  director.js         טיסות מצלמה ב־GSAP, נסיעה עם המעבורת, OrbitControls במנוחה
  ui.js               טוען, ציר זמן, פרקים, פינים, חלון מיקום, מגירת מידע
  audio.js            אווירה סינתטית (Web Audio), כבויה כברירת מחדל
assets/
  models/             אופציונלי: ferry.glb יחליף את המעבורת הפרוצדורלית
  textures/ images/   ריקים — כל הטקסטורות והתמונות נוצרות בקוד
build.mjs             אורז את הכול לקובץ HTML יחיד (node build.mjs dist/index.html)
run-agistri.bat       פתיחת הקובץ המוכן בלחיצה כפולה
```

## הערות

- התמונות בחלונות המיקום הן צילומים חיים מתוך הסצנה התלת־ממדית (אין תמונות חיצוניות).
- מתג האיכות בסרגל העליון מדליק/מכבה SSAO ומשנה רזולוציית צללים ו־DPR.
- על מסכי מגע הגלילה היא הסיפור; סיבוב חופשי של המצלמה זמין בעכבר.
