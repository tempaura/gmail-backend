import express from "express";
import cors from "cors";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Gmail Backend Running ✅");
});

app.post("/emails", async (req, res) => {
  const out = [];
  const accounts = req.body.accounts || [];

  for (const acc of accounts) {
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: {
        user: acc.email,
        pass: acc.appPassword.replace(/\s/g, ""),
      },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");

      try {
        const messages = [];
        for await (const msg of client.fetch("1:*", { envelope: true, source: true })) {
          messages.push(msg);
          if (messages.length >= 20) break;
        }

        for (const msg of messages.reverse()) {
          const parsed = await simpleParser(msg.source);
          out.push({
            account: acc.name,
            email: acc.email,
            from: parsed.from?.text || "",
            subject: parsed.subject || "(no subject)",
            date: parsed.date || new Date(),
            snippet: (parsed.text || "").slice(0, 200),
          });
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (err) {
      console.error(`Error ${acc.email}:`, err.message);
    }
  }

  out.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ emails: out });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
