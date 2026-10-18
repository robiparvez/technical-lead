# Technical Lead Study Guide

A free study site for people preparing for a Technical Lead interview. It has 532 questions with model answers, a quiz for every topic, and a place to track what you already know.

Live at https://robiparvez.github.io/technical-lead/

![The home page: a list of 20 topics and 13 technologies](docs/screenshots/home.png)

## What it is

The questions follow a Technical Lead job description: 5 to 7 years of experience, full-stack work, plus leading a team. The guide covers what that role asks for. There are 14 technical topics, such as microservices, databases, system design and security. There are also 6 topics on the people side of the job, such as code review, mentoring, working with stakeholders and the HR round.

You never need an account. Everything runs in your browser, and nothing you do leaves your device. If you want your progress to follow you to another browser, you can sign in — see "Keep track of what you know".

## Read the answers

Open a topic and you see its questions laid out along one line, from basic to intermediate to advanced. Click a question to open the answer. Each answer ends with a one-line key takeaway, so you can skim a whole topic in a few minutes and still come away with the main point of every question.

Most answers come with a short animated diagram that you play, pause and restart yourself, and 62 of them add a code snippet.

![A question opened on the page, showing the answer, a diagram and the key takeaway](docs/screenshots/answer.png)

## Find questions by technology

You might not be studying a whole topic. Maybe you have an interview where they will ask about Kafka, or Kubernetes, or Next.js. Pick the technology from the sidebar or from the home page, and you get every question about it from all the topics in one list. Each card shows which topic it came from.

There are 13 technologies: AWS, Docker, GraphQL, gRPC, Java, Kafka, Kubernetes, Next.js, Node.js, OAuth/JWT, React, Stripe and Terraform.

Every question also carries small tags such as `kafka` or `idempotency`. Click one to see all questions that share it.

![The Kafka page, listing five questions from one topic](docs/screenshots/technology.png)

## Test yourself with a quiz

Each topic has a quiz. An attempt asks 10 questions in random order, and you pick the right takeaway from four options. A correct answer earns 10, 20 or 30 points depending on the difficulty. A wrong answer costs half of that. The next attempt skips the questions you just saw.

![A quiz question with the correct answer marked](docs/screenshots/quiz.png)

## Keep track of what you know

Press "Mark as known" on any answer. The sidebar and the home page show a count for each topic and technology, like 12/28, so you can see where the gaps are. Your progress and quiz scores stay in your browser's local storage. Clear your browser data and they go away.

If you sign in (the sign-in control sits in the sidebar, the page is `/login`), your known questions and quiz scores sync, so they follow you to another browser or device. Signing in is optional: signed out, or with the sync service unreachable, the site behaves exactly as described above. The sync needs the site's backend, which is not part of the static Pages site; see [docs/TECHNICAL.md](docs/TECHNICAL.md) for how that fits together.

## Small things that help

- Press `/` anywhere to search questions, answers, takeaways and tags.
- Press `Ctrl+B` (`Cmd+B` on a Mac) to hide the sidebar.
- Click the full-screen button next to the theme button to fill the whole screen. Press `Esc` to leave it.
- The site follows your system's light or dark setting until you click the sun or moon button.
- It works on a phone.
- The References page lists the sources used to choose the questions.

![The home page on a phone in dark mode](docs/screenshots/phone-dark.png)

## Editing the content (for the site owner)

Questions and topics can be edited in the browser on the `/admin` page. It is not linked from the site and search engines are told to skip it, and it needs an account with the admin role, which is granted from the command line (`npm run admin:grant -- <email>` inside `server/`). Saved edits go into the database and reach the public site on its next rebuild. Setup and details: [docs/TECHNICAL.md](docs/TECHNICAL.md).

## Run it yourself

You need Node.js.

```bash
npm install
npm run dev
```

Open http://localhost:3000. To build the static site, run `npm run build`. It writes the site to the `out/` folder, and `npm start` serves it.

The site is plain static files, so it runs on GitHub Pages with no server. A GitHub Action rebuilds and publishes it every time someone pushes to `master`.

The sign-in, syncing and `/admin` features talk to a separate API that lives in the `server/` folder of this repository. The public site does not need it, and running it yourself is optional — how to do that is in [docs/TECHNICAL.md](docs/TECHNICAL.md).

## For developers

How the code is organized, the design tokens, how each control behaves with keyboard and touch, the deploy setup and package versions are in [docs/TECHNICAL.md](docs/TECHNICAL.md).
