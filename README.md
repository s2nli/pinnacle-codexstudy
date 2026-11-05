# CODEX STUDYS - E-Books Library
Deploy this folder on Vercel/Netlify (static). Open index.html.

- books-data.js: Bunny (770), Study Bison (132), PrepBooks (422), RCXE (6), Ebooks Official (399), Panda (1,644), BookieJee (190). Download links go to the Telegram channel; Bunny, PrepBooks (Drive) and RCXE open in the in-app reader.
- Live: Pinnacle API (chapter-wise reader), Gutenberg (auto-loads while scrolling), Open Library, Google Books, Standard Ebooks, Crossref, arXiv, Semantic Scholar, PubMed Central, LibriVox, MangaDex, Jikan (load when their category is opened or when searching).
- If a live API is blocked by CORS, deploy proxy-worker.js (Cloudflare Worker) and set PROXY at the top of the library module in app.js.
