# Technical Lead Study Guide

A free study site for people preparing for a Technical Lead interview. It has 532 questions with model answers, a quiz for every topic, and a place to track what you already know.

Live at https://robiparvez.github.io/technical-lead/

![The home page: a list of 20 topics and 13 technologies](docs/screenshots/home.png)

## What it is

The questions follow a Technical Lead job description: 5 to 7 years of experience, full-stack work, plus leading a team. The guide covers what that role asks for. There are 14 technical topics, such as microservices, databases, system design and security. There are also 6 topics on the people side of the job, such as code review, mentoring, working with stakeholders and the HR round.

You never need an account. Everything runs in your browser, and nothing you do leaves your device. Accounts exist only for the site admin, who edits the content (see "Editing the content").

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

Visitors have no sign-in, so this progress stays on the device. The admin account is the exception: while the admin is signed in, known questions and quiz scores also sync to the site's backend, which is the same API that serves the site's content. See [docs/TECHNICAL.md](docs/TECHNICAL.md) for how that fits together.

## Small things that help

- Press `/` anywhere to search questions, answers, takeaways and tags.
- Press `Ctrl+B` (`Cmd+B` on a Mac) to hide the sidebar.
- Click the full-screen button next to the theme button to fill the whole screen. Press `Esc` to leave it.
- The site follows your system's light or dark setting until you click the sun or moon button.
- It works on a phone.
- The References page lists the sources used to choose the questions.

![The home page on a phone in dark mode](docs/screenshots/phone-dark.png)

## Editing the content (for the site owner)

Questions and topics can be edited in the browser on the `/admin` page. It is not linked from the site and search engines are told to skip it. To use it, create an account on the `/login` page, then grant that account the admin role from the command line (`npm run admin:grant -- <email>` inside `server/`). After you sign in, `/admin` shows the content editor, and the Account page there changes your password. If you forget it, use "Forgot password?" on the sign-in screen; in development the mail is caught by MailHog and you read it at http://localhost:8025 (setup in [docs/TECHNICAL.md](docs/TECHNICAL.md)). Saved edits go into the database, and the public site shows them the next time a page loads. Setup and details: [docs/TECHNICAL.md](docs/TECHNICAL.md).

## Run it yourself

You need Node.js and PostgreSQL.

The questions live in PostgreSQL and the site reads them through the API in the `server/` folder, so start the API first. Setup is in [docs/TECHNICAL.md](docs/TECHNICAL.md). The database holds all the content, so restore it from a `pg_dump` backup on a new machine.

```bash
npm install
npm run dev
```

Open http://localhost:3000. To run a production build, use `npm run build` and then `npm start`. The site needs the API while it runs. If the API is down, pages show a "Content is not available" message.

The old GitHub Pages deploy was removed, because the site needs a host that can run Node. Until a host is chosen, a GitHub check only lints and builds the app.

## For developers

How the code is organized, the design tokens, how each control behaves with keyboard and touch, the deploy setup and package versions are in [docs/TECHNICAL.md](docs/TECHNICAL.md).
