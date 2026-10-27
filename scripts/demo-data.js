// The demo content that scripts/seed-demo.js writes into the database.
// Days are relative to the moment the seed runs (negative = in the past), so
// deadlines, scheduled posts and live classes always look current.

// Every demo account uses this domain, which is how --remove finds them.
export const DEMO_DOMAIN = "demo.coursework.test";
export const DEMO_PASSWORD = "Demo@1234";

export const admin = { name: "Kavya Menon", email: "kavya.menon" };

export const teachers = [
  { key: "ananya", name: "Ananya Rao", email: "ananya.rao" },
  { key: "daniel", name: "Daniel Okafor", email: "daniel.okafor" },
  { key: "meera", name: "Meera Iyer", email: "meera.iyer" },
  { key: "lucas", name: "Lucas Fernandes", email: "lucas.fernandes" },
];

export const students = [
  "Aarav Sharma", "Diya Patel", "Rohan Gupta", "Ishita Verma", "Kabir Singh", "Saanvi Reddy",
  "Arjun Nair", "Neha Joshi", "Vihaan Kapoor", "Anika Bose", "Emma Thompson", "Liam O'Connor",
  "Sofia Martinez", "Noah Kim", "Chloe Dubois", "Yusuf Ahmed", "Mei Lin", "Lucas Silva",
  "Fatima Khan", "Ethan Brooks", "Priya Krishnan", "Omar Haddad", "Zara Ali", "Kenji Watanabe",
  "Amara Okeke", "Tanvi Desai", "Rahul Mehta", "Grace Wilson", "Aditya Kulkarni", "Leah Cohen",
];

// Untaught courses students also join (progress and built-in quizzes only).
export const extraCourses = [
  "intro-to-nodejs", "react-fundamentals", "git-and-github", "machine-learning",
  "artificial-intelligence", "typescript-basics", "rest-apis-and-http",
];

const q = (prompt, options, correct, explanation) => ({ prompt, options, correctIndex: correct, explanation });

// One entry per taught course. `ref` values in announcements point at items
// in the same course: "assignment:0", "quiz:1", "live:2", "material:0".
export const courses = [
  {
    slug: "web-design",
    teacher: "ananya",
    materials: [
      { kind: "file", title: "Week 1 slides: HTML structure", description: "Slides from the first live class, with the element cheat sheet at the end.", days: -33,
        file: { name: "Week 1 - HTML structure.pdf", pdf: ["Week 1: HTML structure", "Elements describe what content is, not how it looks.", "Headings: one h1 per page, then h2 and h3 in order.", "Links: <a href> to pages, # to sections, mailto: for email.", "Lists: ul for unordered, ol for ordered steps.", "Semantic tags: header, nav, main, article, footer.", "Next week: the box model and CSS selectors."] } },
      { kind: "file", title: "Box model cheat sheet", description: "Margin, border, padding and content on one page.", days: -24,
        file: { name: "box-model-cheat-sheet.md", text: "# Box model cheat sheet\n\nEvery element is a box, from the inside out:\n\n1. **Content**: the text or image\n2. **Padding**: space inside the border\n3. **Border**: the visible edge\n4. **Margin**: space outside, between boxes\n\n```css\n*, *::before, *::after { box-sizing: border-box; }\n.card { padding: 16px; border: 1px solid #ddd; margin-bottom: 24px; }\n```\n\nWith `border-box`, `width` includes padding and border, so layouts add up.\n" } },
      { kind: "link", title: "MDN: HTML elements reference", description: "Every HTML element, with examples.", url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element", days: -33 },
      { kind: "link", title: "A complete guide to Flexbox", description: "The diagram-led reference we used in class.", url: "https://css-tricks.com/snippets/css/a-guide-to-flexbox/", days: -16 },
      { kind: "file", title: "Portfolio starter files", description: "index.html and styles.css to start the final project from.", days: -9,
        file: { name: "portfolio-starter.html", text: "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>My portfolio</title>\n  <style>\n    body { font-family: system-ui, sans-serif; margin: 0; }\n    header, main, footer { padding: 24px; max-width: 960px; margin: 0 auto; }\n    .projects { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }\n  </style>\n</head>\n<body>\n  <header><h1>Your name</h1><p>One line about you.</p></header>\n  <main>\n    <h2>Projects</h2>\n    <section class=\"projects\">\n      <article><h3>Project one</h3><p>What it does and what you learned.</p></article>\n    </section>\n  </main>\n  <footer><a href=\"mailto:you@example.com\">Email me</a></footer>\n</body>\n</html>\n" } },
    ],
    assignments: [
      { title: "Build an About Me page", days: -26, created: -33, maxPoints: 20,
        instructions: "Create a single HTML page about yourself using at least: one h1, two h2 sections, a list, a link and an image with alt text. No CSS needed yet. Submit the HTML file or paste your code.",
        answers: ["I used header, main and footer, with a list of my hobbies and a link to my GitHub.", "Attached my about.html. I added alt text to the photo and used an ordered list for my goals.", "Here is my page. I wasn't sure whether the image should be inside a figure, so I used figure and figcaption."],
        file: { name: "about.html", text: "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><title>About me</title></head>\n<body>\n  <header><h1>Hi, I'm a web design student</h1></header>\n  <main>\n    <h2>What I like</h2>\n    <ul><li>Photography</li><li>Football</li><li>Cooking</li></ul>\n    <h2>Find me</h2>\n    <p><a href=\"https://github.com\">My GitHub</a></p>\n    <img src=\"me.jpg\" alt=\"Me at the beach\">\n  </main>\n</body>\n</html>\n" },
        feedback: ["Clean, semantic structure. Nice use of header and main.", "Good work. Remember every image needs meaningful alt text.", "Solid page. Check your heading order: don't skip from h1 to h3.", "Great job, and well-organised sections."] },
      { title: "Style a profile card", days: -12, created: -22, maxPoints: 30,
        instructions: "Using your About Me page, add a stylesheet that turns your intro into a profile card: padding, a border or shadow, rounded corners, and a readable font. Use box-sizing: border-box. Include a screenshot or your CSS.",
        answers: ["My card uses 24px padding, an 8px radius and a soft shadow. I switched to border-box so the width stays 320px.", "CSS attached. I used a CSS variable for the accent colour so I can change it in one place.", "I struggled with centring the card but got it with margin: 0 auto and a max-width."],
        file: { name: "card.css", text: ":root { --accent: #2563eb; }\n*, *::before, *::after { box-sizing: border-box; }\n.card {\n  max-width: 320px;\n  margin: 40px auto;\n  padding: 24px;\n  border-radius: 8px;\n  box-shadow: 0 4px 16px rgb(0 0 0 / 0.1);\n  font-family: system-ui, sans-serif;\n}\n.card h1 { color: var(--accent); }\n" },
        feedback: ["Lovely card. The shadow and spacing feel balanced.", "Good use of a variable for the accent colour.", "Nice work. Try a larger line-height for body text.", "Centring is spot on now. Well done for sticking with it."] },
      { title: "Responsive photo gallery", days: 2, created: -8, maxPoints: 40,
        instructions: "Build a gallery of at least 6 images with CSS Grid. It should show 1 column on phones, 2 on tablets and 3 or more on desktops. Use a media query or auto-fit with minmax. Test it by resizing the browser.",
        answers: ["I used grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)) so I didn't need media queries.", "Gallery attached. Images use object-fit: cover so they crop neatly."],
        file: { name: "gallery.html", text: "<section class=\"gallery\">\n  <img src=\"1.jpg\" alt=\"Mountain lake\">\n  <img src=\"2.jpg\" alt=\"City at night\">\n</section>\n<style>\n  .gallery { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }\n  .gallery img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; }\n</style>\n" },
        feedback: [] },
      { title: "Final project: personal portfolio", days: 16, created: -5, maxPoints: 100,
        instructions: "Build a three-section portfolio site (intro, projects, contact) from the starter files. It must be responsive, use semantic HTML, have accessible colours, and include at least three projects. Submit a link to the hosted site or a zip of your files.",
        answers: ["Early draft: https://example.com/portfolio. I'll keep improving the projects section."],
        feedback: [] },
    ],
    quizzes: [
      { kind: "quiz", title: "HTML structure check", description: "A quick check on elements and semantics.", days: -28, published: true, dueDays: -20,
        questions: [
          q("Which element should wrap the main content of a page?", ["<section>", "<main>", "<div id=\"main\">", "<body>"], 1, "There should be one <main> per page, holding its primary content."),
          q("What does the alt attribute on an image do?", ["Sets the image size", "Describes the image for screen readers", "Adds a caption below it", "Loads a fallback image"], 1, "Alt text is read by screen readers and shown if the image fails to load."),
          q("Which list is best for step-by-step instructions?", ["<ul>", "<dl>", "<ol>", "<menu>"], 2, "Order matters in steps, so use an ordered list."),
          q("How many h1 elements should a typical page have?", ["None", "One", "One per section", "As many as needed"], 1, "One h1 names the page; sections use h2 and below."),
        ] },
      { kind: "quiz", title: "Selectors and the box model", description: "CSS selectors, specificity and spacing.", days: -14, published: true, dueDays: -6,
        questions: [
          q("Which selector has the highest specificity?", [".card", "#profile", "article p", "*"], 1, "An id selector beats classes, elements and the universal selector."),
          q("With box-sizing: border-box, what does width include?", ["Content only", "Content and padding", "Content, padding and border", "Everything including margin"], 2, "border-box includes padding and border, but never margin."),
          q("Which property adds space outside an element's border?", ["padding", "margin", "gap", "outline"], 1, "Margin sits outside the border; padding sits inside."),
          q("What does .nav a select?", ["Links with the class nav", "Any link inside an element with class nav", "Only the first link in nav", "Elements with both classes"], 1, "A space is the descendant combinator: any a inside .nav."),
        ] },
      { kind: "quiz", title: "Flexbox and Grid warm-up", description: "Draft for next week; not visible to students yet.", days: -2, published: false,
        questions: [
          q("Which property lines up flex items along the main axis?", ["align-items", "justify-content", "flex-wrap", "place-self"], 1, "justify-content works on the main axis; align-items on the cross axis."),
          q("What does fr mean in grid-template-columns?", ["Frame", "A fraction of the free space", "A fixed rem value", "Font-relative size"], 1, "fr shares out the remaining space in a grid container."),
          q("Which value makes a grid fit as many columns as will fit?", ["auto-fill or auto-fit with minmax()", "span 12", "grid-auto-flow: dense", "repeat(3, 1fr)"], 0, "repeat(auto-fit, minmax(…)) adds columns as space allows."),
        ] },
      { kind: "test", title: "Midterm: HTML and CSS", description: "25 minutes, one attempt. Covers lessons 1–12.", days: -11, published: true, dueDays: -4, timeLimitMin: 25, maxAttempts: 1,
        questions: [
          q("Which tag is used for the most important heading?", ["<head>", "<h6>", "<h1>", "<header>"], 2, "h1 is the top-level heading; <head> holds page metadata."),
          q("Which unit is relative to the root font size?", ["em", "rem", "px", "%"], 1, "rem is relative to the html element's font size."),
          q("What does position: sticky do?", ["Removes the element from the flow", "Scrolls normally until it reaches an offset, then sticks", "Always stays fixed to the viewport", "Centres the element"], 1, "Sticky behaves like relative until its offset is reached."),
          q("Which colour contrast ratio does WCAG AA require for body text?", ["2:1", "3:1", "4.5:1", "7:1"], 2, "AA requires 4.5:1 for normal-size text."),
          q("Which attribute makes a link open in a new tab?", ["rel=\"new\"", "target=\"_blank\"", "href=\"new\"", "open=\"tab\""], 1, "target=\"_blank\" opens a new tab; add rel=\"noopener\" for safety."),
          q("What does display: none do compared to visibility: hidden?", ["Nothing different", "Removes the element from layout entirely", "Keeps its space but hides it", "Only hides text"], 1, "display: none removes the box; visibility: hidden keeps its space."),
        ] },
      { kind: "test", title: "Final test: layout and accessibility", description: "30 minutes, two attempts. Opens after the gallery is due.", days: -1, published: true, dueDays: 9, timeLimitMin: 30, maxAttempts: 2,
        questions: [
          q("Which layout tool is best for a two-dimensional page grid?", ["Flexbox", "Grid", "Floats", "Tables"], 1, "Grid handles rows and columns together; Flexbox is one-dimensional."),
          q("What is a media query used for?", ["Loading videos", "Applying styles at certain screen sizes", "Querying a database", "Embedding audio"], 1, "Media queries apply CSS when conditions like width are met."),
          q("Which element gives a form field an accessible name?", ["<span>", "<label>", "<legend> only", "placeholder"], 1, "A <label> tied to the input names it for screen readers."),
          q("What does gap do in a flex or grid container?", ["Adds space between items", "Adds space outside the container", "Adds padding to each item", "Removes margins"], 0, "gap sets the spacing between items, not around them."),
          q("Which meta tag makes a page scale correctly on phones?", ["<meta charset>", "<meta name=\"viewport\">", "<meta name=\"mobile\">", "<meta http-equiv>"], 1, "The viewport meta tag sets the page width to the device width."),
        ] },
    ],
    live: [
      { title: "Kick-off: how the web works", days: -34, hour: 18, duration: 60, description: "Course overview, tools to install, and our first page." },
      { title: "The box model, live", days: -20, hour: 18, duration: 75, description: "We build a card together and debug spacing in DevTools." },
      { title: "Flexbox clinic", days: -6, hour: 18, duration: 60, description: "Bring your layout questions." },
      { title: "Office hours: gallery assignment", days: 0, hour: null, duration: 60, description: "Drop in with questions before the gallery is due." },
      { title: "Portfolio reviews", days: 7, hour: 18, duration: 90, description: "Share your screen for feedback on your final project." },
    ],
    announcements: [
      { title: "Welcome to Introduction to Web Design!", body: "Hi everyone, I'm Ananya. Each week has a live class, a short quiz and one assignment. Start with lessons 1 to 3, and say hello in our first live class.", category: "general", pinned: true, days: -35 },
      { title: "About Me page is due Friday", body: "Your first assignment is due this Friday at 11:59 pm. Keep it simple: structure first, styling comes next week.", category: "assignment", ref: "assignment:0", days: -29 },
      { title: "Midterm opens today", body: "The midterm covers lessons 1 to 12. You have 25 minutes and one attempt, so start it when you have a quiet half hour.", category: "test", ref: "quiz:3", days: -11 },
      { title: "Slides and recording notes posted", body: "The box model slides and the cheat sheet are in Learning materials.", category: "material", ref: "material:1", days: -24 },
      { title: "Office hours today", body: "I'm running office hours today for the gallery assignment. Join from the Live class section.", category: "live", ref: "live:3", days: 0 },
      { title: "Portfolio reviews next week", body: "Sign up for a five-minute slot in next week's live class. Bring a draft, even if it's rough.", category: "live", ref: "live:4", days: 2, scheduled: true },
      { title: "Final test tips", body: "Draft: remind students about the two attempts and the 30-minute limit.", category: "test", ref: "quiz:4", draft: true },
    ],
  },
  {
    slug: "javascript-essentials",
    teacher: "daniel",
    materials: [
      { kind: "file", title: "Lecture 1 slides: values and variables", description: "let, const, types and template literals.", days: -30,
        file: { name: "Lecture 1 - values and variables.pdf", pdf: ["Lecture 1: values and variables", "Use const by default; use let when a value changes.", "Primitive types: string, number, boolean, null, undefined.", "Template literals: `Hello, ${name}!`", "typeof tells you a value's type at runtime.", "== converts types; prefer === for comparisons."] } },
      { kind: "file", title: "Array methods cheat sheet", description: "map, filter, reduce, find and friends.", days: -18,
        file: { name: "array-methods.md", text: "# Array methods\n\n| Method | Returns | Use it to |\n| --- | --- | --- |\n| `map` | new array | transform every item |\n| `filter` | new array | keep items that pass a test |\n| `find` | one item or undefined | get the first match |\n| `reduce` | any value | combine items into one result |\n| `some` / `every` | boolean | test any / all items |\n\n```js\nconst prices = [4, 10, 25];\nconst total = prices.reduce((sum, p) => sum + p, 0); // 39\n```\n" } },
      { kind: "link", title: "MDN JavaScript guide", description: "The reference to keep open while you code.", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", days: -30 },
      { kind: "link", title: "javascript.info: Promises and async/await", description: "Clear chapters for the async unit.", url: "https://javascript.info/async", days: -7 },
    ],
    assignments: [
      { title: "Tip calculator", days: -21, created: -28, maxPoints: 20,
        instructions: "Write a function tip(bill, percent) that returns the tip and the total, rounded to 2 decimals. Handle bad input by returning null. Include three example calls and their output.",
        answers: ["I return an object { tip, total } and use Math.round(x * 100) / 100 for rounding.", "Attached tip.js. Negative bills return null."],
        file: { name: "tip.js", text: "function tip(bill, percent) {\n  if (typeof bill !== \"number\" || bill < 0) return null;\n  const t = Math.round(bill * percent) / 100;\n  return { tip: t, total: Math.round((bill + t) * 100) / 100 };\n}\nconsole.log(tip(50, 15)); // { tip: 7.5, total: 57.5 }\n" },
        feedback: ["Correct and readable. Nice input checks.", "Works well; consider naming the rounding into a helper.", "Good, but percent isn't validated."] },
      { title: "Shopping list with array methods", days: -7, created: -15, maxPoints: 30,
        instructions: "Given an array of items { name, price, qty }, use map, filter and reduce to print: items over 5 dollars, the total cost, and a list of names in capital letters. No for loops.",
        answers: ["Used filter for the expensive items and reduce for the total. All in one file, attached.", "My reduce starts from 0 so an empty list totals 0."],
        file: { name: "shopping.js", text: "const items = [{ name: \"milk\", price: 2, qty: 2 }, { name: \"cheese\", price: 7, qty: 1 }];\nconst pricey = items.filter((i) => i.price > 5);\nconst total = items.reduce((sum, i) => sum + i.price * i.qty, 0);\nconst names = items.map((i) => i.name.toUpperCase());\nconsole.log(pricey, total, names);\n" },
        feedback: ["Excellent use of all three methods.", "Good. Watch the starting value in reduce.", "Nice and concise."] },
      { title: "Weather widget with fetch", days: 5, created: -4, maxPoints: 40,
        instructions: "Fetch the current weather for a city from a public API and show it on the page. Show a loading message while waiting and a friendly error if the request fails. Use async/await.",
        answers: ["Using async/await with try/catch; the loading text clears in a finally block."],
        feedback: [] },
    ],
    quizzes: [
      { kind: "quiz", title: "Values, types and operators", description: "Warm-up on the basics.", days: -26, published: true, dueDays: -19,
        questions: [
          q("What does typeof null return?", ["\"null\"", "\"object\"", "\"undefined\"", "\"number\""], 1, "A long-standing quirk: typeof null is \"object\"."),
          q("Which keyword declares a variable you can't reassign?", ["var", "let", "const", "static"], 2, "const bindings can't be reassigned."),
          q("What is \"5\" + 2?", ["7", "\"52\"", "NaN", "Error"], 1, "+ with a string concatenates."),
          q("Which comparison avoids type conversion?", ["==", "=", "===", "=>"], 2, "=== compares value and type."),
        ] },
      { kind: "quiz", title: "Arrays and objects", description: "map, filter, reduce, and object basics.", days: -12, published: true,
        questions: [
          q("What does [1, 2, 3].map(n => n * 2) return?", ["[2, 4, 6]", "12", "[1, 2, 3]", "undefined"], 0, "map returns a new array with each item transformed."),
          q("Which method returns the first matching item?", ["filter", "find", "some", "indexOf"], 1, "find returns the first item that passes, or undefined."),
          q("How do you read the key \"first name\" from obj?", ["obj.first name", "obj[\"first name\"]", "obj->first name", "obj(first name)"], 1, "Keys with spaces need bracket notation."),
        ] },
      { kind: "test", title: "Unit test: JavaScript fundamentals", description: "20 minutes, one attempt.", days: -9, published: true, dueDays: -2, timeLimitMin: 20, maxAttempts: 1,
        questions: [
          q("What does Array.isArray([]) return?", ["true", "false", "\"array\"", "undefined"], 0, "It's the reliable way to check for an array."),
          q("Which runs after a Promise settles either way?", ["then", "catch", "finally", "await"], 2, "finally runs on success and failure."),
          q("What is the value of x after let x = 3; x += 2?", ["3", "5", "32", "6"], 1, "x += 2 adds 2 to x."),
          q("Which creates a shallow copy of an array?", ["arr", "[...arr]", "arr.copy()", "new arr"], 1, "The spread syntax copies items into a new array."),
          q("What does JSON.parse do?", ["Turns an object into text", "Turns JSON text into a value", "Validates HTML", "Fetches JSON"], 1, "parse reads JSON text; stringify writes it."),
        ] },
    ],
    live: [
      { title: "JavaScript kick-off", days: -31, hour: 17, duration: 60, description: "Setting up VS Code and Node, and our first script." },
      { title: "Debugging with DevTools", days: -17, hour: 17, duration: 60, description: "Breakpoints, the console, and reading errors." },
      { title: "Async JavaScript explained", days: 3, hour: 17, duration: 75, description: "Promises, async/await and fetch, before the weather widget." },
    ],
    announcements: [
      { title: "Welcome to JavaScript Essentials", body: "Hello! I'm Daniel. We'll write real code from day one. Install VS Code and Node before our first live class.", category: "general", pinned: true, days: -32 },
      { title: "Shopping list assignment is up", body: "Practise map, filter and reduce. No for loops allowed this time!", category: "assignment", ref: "assignment:1", days: -15 },
      { title: "Unit test this week", body: "The unit test is 20 minutes with one attempt. Review lessons 1 to 10 first.", category: "test", ref: "quiz:2", days: -9 },
      { title: "Async class on Thursday", body: "We'll cover Promises and fetch on Thursday, right before the weather widget assignment.", category: "live", ref: "live:2", days: -1 },
    ],
  },
  {
    slug: "python-for-beginners",
    teacher: "meera",
    materials: [
      { kind: "file", title: "Python setup guide", description: "Installing Python and running your first script on Windows and macOS.", days: -27,
        file: { name: "python-setup.pdf", pdf: ["Python setup guide", "1. Download Python 3 from python.org and run the installer.", "2. On Windows, tick 'Add python.exe to PATH'.", "3. Open a terminal and run: python --version", "4. Save hello.py with: print('Hello!')", "5. Run it with: python hello.py"] } },
      { kind: "file", title: "Practice data: class grades", description: "A CSV to practise reading files and loops.", days: -10,
        file: { name: "grades.csv", text: "name,maths,science,english\nAsha,82,91,77\nBen,68,74,88\nChen,95,89,92\nDara,71,65,80\nEli,88,93,85\n" } },
      { kind: "link", title: "Official Python tutorial", description: "Sections 3 to 5 match our first three weeks.", url: "https://docs.python.org/3/tutorial/", days: -27 },
    ],
    assignments: [
      { title: "Number guessing game", days: -16, created: -24, maxPoints: 25,
        instructions: "Write a game that picks a random number from 1 to 100 and lets the player guess, saying 'higher' or 'lower' each time. Count the guesses and print the total at the end.",
        answers: ["Used a while loop and random.randint. It also stops if you type q.", "Attached guess.py. I added input validation with try/except."],
        file: { name: "guess.py", text: "import random\n\nsecret = random.randint(1, 100)\nguesses = 0\nwhile True:\n    guess = int(input(\"Your guess: \"))\n    guesses += 1\n    if guess < secret:\n        print(\"Higher\")\n    elif guess > secret:\n        print(\"Lower\")\n    else:\n        print(f\"Got it in {guesses} guesses!\")\n        break\n" },
        feedback: ["Works perfectly. The try/except is a nice touch.", "Good loop. Handle non-number input next time.", "Clear and well commented."] },
      { title: "Grade report from a CSV", days: 4, created: -6, maxPoints: 35,
        instructions: "Read grades.csv from Learning materials and print each student's average, the class average per subject, and the top student. Use functions and the csv module.",
        answers: ["I wrote average() and top_student() and used csv.DictReader."],
        feedback: [] },
    ],
    quizzes: [
      { kind: "quiz", title: "Python basics check", description: "Variables, input and printing.", days: -22, published: true,
        questions: [
          q("What does print(type(3.0)) show?", ["<class 'int'>", "<class 'float'>", "<class 'str'>", "<class 'number'>"], 1, "3.0 is a float."),
          q("How do you turn the string \"42\" into a number?", ["num(\"42\")", "int(\"42\")", "\"42\".number()", "parse(\"42\")"], 1, "int() converts a string of digits to an integer."),
          q("Which is a valid f-string?", ["f\"Hi {name}\"", "\"Hi {name}\"f", "f'Hi ' + name", "format\"Hi {name}\""], 0, "Put f before the quotes and names in braces."),
          q("What does 7 // 2 give?", ["3.5", "3", "4", "1"], 1, "// is floor division."),
        ] },
      { kind: "test", title: "Loops and lists test", description: "15 minutes, two attempts.", days: -8, published: true, dueDays: 1, timeLimitMin: 15, maxAttempts: 2,
        questions: [
          q("What does range(3) produce?", ["1, 2, 3", "0, 1, 2", "0, 1, 2, 3", "3"], 1, "range stops before its end value."),
          q("How do you add an item to the end of a list?", ["list.add(x)", "list.append(x)", "list.push(x)", "list + x"], 1, "append adds one item to the end."),
          q("What is len([1, [2, 3]])?", ["3", "2", "1", "Error"], 1, "The inner list counts as one item."),
          q("Which loop runs while a condition is true?", ["for", "while", "repeat", "loop"], 1, "while repeats as long as its condition holds."),
        ] },
    ],
    live: [
      { title: "Welcome and setup help", days: -28, hour: 16, duration: 60, description: "Getting Python installed on everyone's machine." },
      { title: "Loops, live coding", days: -13, hour: 16, duration: 60, description: "We build the guessing game together." },
      { title: "Files and CSVs", days: 1, hour: 16, duration: 60, description: "Reading files before the grade report assignment." },
    ],
    announcements: [
      { title: "Welcome, Python beginners!", body: "No experience needed. If installing Python gives you trouble, come to the first live class and we'll fix it together.", category: "general", pinned: true, days: -29 },
      { title: "Grades CSV uploaded", body: "Download grades.csv from Learning materials for the next assignment.", category: "material", ref: "material:1", days: -10 },
      { title: "Loops test closes tomorrow", body: "You have two attempts. Your best score counts.", category: "test", ref: "quiz:1", days: -1 },
    ],
  },
  {
    slug: "sql-databases",
    teacher: "lucas",
    materials: [
      { kind: "file", title: "Sample database: bookshop", description: "Run this script to create the tables we use in class.", days: -25,
        file: { name: "bookshop.sql", text: "CREATE TABLE authors (id INT PRIMARY KEY, name VARCHAR(100));\nCREATE TABLE books (id INT PRIMARY KEY, title VARCHAR(200), author_id INT, price DECIMAL(6,2),\n  FOREIGN KEY (author_id) REFERENCES authors(id));\nINSERT INTO authors VALUES (1, 'Octavia Butler'), (2, 'Ursula K. Le Guin');\nINSERT INTO books VALUES (1, 'Kindred', 1, 12.99), (2, 'The Dispossessed', 2, 10.50), (3, 'Parable of the Sower', 1, 11.25);\n" } },
      { kind: "file", title: "JOINs explained", description: "Inner, left and right joins with pictures in words.", days: -12,
        file: { name: "joins-explained.pdf", pdf: ["JOINs explained", "INNER JOIN: rows that match in both tables.", "LEFT JOIN: every row from the left table, matches or NULLs.", "RIGHT JOIN: every row from the right table.", "Always join on a key: ON books.author_id = authors.id", "Check row counts before and after a join."] } },
      { kind: "link", title: "MySQL SELECT reference", description: "Every clause of SELECT.", url: "https://dev.mysql.com/doc/refman/8.4/en/select.html", days: -25 },
    ],
    assignments: [
      { title: "Bookshop queries", days: -10, created: -18, maxPoints: 30,
        instructions: "Using the bookshop database, write queries for: all books under 12 dollars, books sorted by price, the number of books per author, and each book with its author's name. Paste each query and its result.",
        answers: ["All four queries attached. I used GROUP BY author_id with COUNT(*) for the third.", "I used an INNER JOIN for the last one and aliased the tables as b and a."],
        file: { name: "bookshop-queries.sql", text: "SELECT * FROM books WHERE price < 12;\nSELECT title, price FROM books ORDER BY price;\nSELECT author_id, COUNT(*) AS books FROM books GROUP BY author_id;\nSELECT b.title, a.name FROM books b JOIN authors a ON a.id = b.author_id;\n" },
        feedback: ["All correct. Good use of aliases.", "Right results; format queries one clause per line for readability.", "Great, and nice use of COUNT(*)."] },
      { title: "Design a schema for a gym", days: 8, created: -3, maxPoints: 40,
        instructions: "Design tables for a gym: members, trainers, classes and bookings. Show the CREATE TABLE statements with primary and foreign keys, and explain one design decision.",
        answers: [],
        feedback: [] },
    ],
    quizzes: [
      { kind: "quiz", title: "SELECT basics", description: "Filtering and sorting.", days: -20, published: true,
        questions: [
          q("Which clause filters rows?", ["ORDER BY", "WHERE", "GROUP BY", "LIMIT"], 1, "WHERE keeps rows that match a condition."),
          q("How do you sort from highest to lowest price?", ["ORDER BY price", "ORDER BY price DESC", "SORT price DOWN", "ORDER price HIGH"], 1, "DESC sorts in descending order."),
          q("Which finds titles starting with 'The'?", ["title = 'The%'", "title LIKE 'The%'", "title STARTS 'The'", "title IN 'The'"], 1, "LIKE with % matches any following text."),
        ] },
      { kind: "quiz", title: "Joins and grouping", description: "Combining tables and summarising.", days: -6, published: true, dueDays: 3,
        questions: [
          q("Which join keeps every row from the left table?", ["INNER JOIN", "LEFT JOIN", "CROSS JOIN", "SELF JOIN"], 1, "LEFT JOIN keeps all left rows, with NULLs where nothing matches."),
          q("Which clause filters groups after GROUP BY?", ["WHERE", "HAVING", "FILTER", "LIMIT"], 1, "HAVING filters on aggregated values."),
          q("What does COUNT(*) count?", ["Non-null values in one column", "Rows", "Distinct values", "Columns"], 1, "COUNT(*) counts rows, including NULLs."),
          q("What does a foreign key enforce?", ["Unique values", "A link to an existing row in another table", "Faster queries", "Not-null values"], 1, "It stops rows pointing at something that doesn't exist."),
        ] },
    ],
    live: [
      { title: "Databases 101", days: -26, hour: 19, duration: 60, description: "Tables, rows and why we need keys." },
      { title: "JOINs workshop", days: -11, hour: 19, duration: 90, description: "Hands-on joins with the bookshop database." },
      { title: "Schema design Q&A", days: 5, hour: 19, duration: 60, description: "Questions on the gym schema assignment." },
    ],
    announcements: [
      { title: "Welcome to SQL and Databases", body: "We'll use MySQL throughout. Load the bookshop database from Learning materials before our first workshop.", category: "general", pinned: true, days: -27 },
      { title: "JOINs workshop recording notes", body: "The JOINs explained handout is now in Learning materials.", category: "material", ref: "material:1", days: -12 },
      { title: "New assignment: gym schema", body: "Design a schema for a gym. Think about how bookings connect members and classes.", category: "assignment", ref: "assignment:1", days: -3 },
      { title: "Schema Q&A on Friday", body: "Bring your draft tables to Friday's Q&A.", category: "live", ref: "live:2", days: 1, scheduled: true },
    ],
  },
];

export const contactMessages = [
  { name: "Ritika Shah", email: "ritika.shah", topic: "A question about a course", message: "Do you plan to add a course on mobile app development? I'd join straight away.", days: -19, handled: true },
  { name: "Mark Evans", email: "mark.evans", topic: "My account", message: "I signed up with the wrong email address. Can it be changed?", days: -12, handled: true },
  { student: 3, topic: "A problem with a quiz", message: "The midterm timer kept running when my laptop went to sleep. Is there any way to get another attempt?", days: -10, handled: true },
  { name: "Hannah Lee", email: "hannah.lee", topic: "Something else", message: "I'm a front-end developer and would love to teach on Coursework. Who should I talk to?", days: -6, handled: false },
  { student: 11, topic: "A question about a course", message: "Will the live classes be recorded? I'm in a different time zone.", days: -3, handled: false },
  { name: "Jonas Becker", email: "jonas.becker", topic: "Something else", message: "Is there a discount for schools that want to sign up a whole class?", days: -1, handled: false },
];
