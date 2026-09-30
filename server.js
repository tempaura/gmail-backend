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

// Har account se saare mails fetch karo
async function fetchAllMails(account) {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: account.email,
      pass: account.appPassword.replace(/\s/g, ""),
    },
    logger: false,
  });

  const mails = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // ✅ SAARE messages fetch karo (koi limit nahi)
      for await (const msg of client.fetch("1:*", {
        envelope: true,
        source: true,
        flags: true,
      })) {
        try {
          const parsed = await simpleParser(msg.source);

          mails.push({
            account: account.name,
            email: account.email,
            from: parsed.from?.text || "",
            subject: parsed.subject || "(no subject)",
            date: parsed.date || new Date(),
            snippet: (parsed.text || "").slice(0, 200),
            seen: msg.flags?.has("\\Seen") || false,
          });
        } catch (err) {
          console.error(`Parse error:`, err.message);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log(`✅ ${account.email}: ${mails.length} mails fetched`);
  } catch (err) {
    console.error(`❌ ${account.email}:`, err.message);
  }

  return mails;
}

// Saare accounts se mails
app.post("/emails", async (req, res) => {
  const accounts = req.body.accounts || [];
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  console.log(`📧 Fetching from ${accounts.length} accounts...`);
  const startTime = Date.now();

  // Parallel fetch (fast)
  const results = await Promise.all(
    accounts.map((acc) => fetchAllMails(acc))
  );

  const allMails = results.flat();

  // Latest pehle
  allMails.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Pagination
  const startIdx = (page - 1) * limit;
  const paginatedMails = allMails.slice(startIdx, startIdx + limit);

  console.log(`⚡ Total: ${allMails.length} mails in ${Date.now() - startTime}ms`);

  res.json({
    emails: paginatedMails,
    total: allMails.length,
    page: page,
    limit: limit,
    hasMore: startIdx + limit < allMails.length,
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
