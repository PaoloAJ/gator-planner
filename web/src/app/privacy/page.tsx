import type { Metadata } from "next";
import Link from "next/link";
import styles from "./privacy.module.css";

// The Chrome Web Store listing links here as the extension's privacy policy.
// Keep it in sync with extension/popup/popup.html (the in-extension notice)
// and extension/STORE_LISTING.md (the store's privacy-practices answers).
// Set CONTACT_EMAIL before publishing.
const CONTACT_EMAIL = "privacy@example.com";
const EFFECTIVE = "October 7, 2026";

export const metadata: Metadata = {
  title: "Privacy notice · GatorPlan",
  description: "How GatorPlan and the GatorPlan Chrome extension handle your data.",
};

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        ← GatorPlan
      </Link>
      <h1>Privacy notice</h1>
      <p className={styles.meta}>Effective {EFFECTIVE}. Covers the GatorPlan website and the GatorPlan Chrome extension.</p>

      <p>
        GatorPlan is a student-built planner for University of Florida classes. It is not affiliated with or endorsed by
        the University of Florida. We collect as little as we can, use it only to plan your schedule or degree, and keep
        none of it.
      </p>

      <h2>The Chrome extension</h2>
      <p>The extension does one thing: it moves your UF degree audit from ONE.UF into GatorPlan’s degree planner.</p>

      <h3>What it reads</h3>
      <ul>
        <li>
          It runs on <code>one.uf.edu</code> pages so it’s ready when you open your degree audit, including when ONE.UF
          switches pages without a reload. It reads one thing: the response to ONE.UF’s degree audit request (the
          request ending in <code>/loaddegreeaudit/</code>). It doesn’t read other ONE.UF pages, other websites, your
          browsing history, your password, or your login cookies.
        </li>
        <li>It reads nothing until you agree to the notice shown the first time you open it.</li>
      </ul>

      <h3>What it removes</h3>
      <p>
        Before your audit leaves the ONE.UF tab, the extension deletes your name, UFID, student and employee IDs, email,
        grades, grade points, and GPA. What remains is your programs (major, minor, catalog year), the requirements in
        your audit and whether they’re met, and the courses you’ve taken or are taking (course, credits, and term).
      </p>

      <h3>When it sends anything</h3>
      <ul>
        <li>
          Only when you click <strong>Open in GatorPlan</strong>. It then opens GatorPlan in a new tab and hands it the
          redacted audit. It waits in your browser’s memory for at most 10 minutes, or until that tab takes it or closes.
        </li>
        <li>
          <strong>Save as .json</strong> saves the same redacted audit to your computer. Nothing is sent.
        </li>
      </ul>

      <h3>What it stores</h3>
      <p>
        Only whether you agreed to this notice, in Chrome’s extension storage on your computer. Use{" "}
        <strong>Withdraw consent</strong> in the extension, or uninstall it, to remove that.
      </p>

      <h2>The GatorPlan website</h2>
      <h3>Degree planner</h3>
      <p>
        When you build a degree plan, your audit (from the extension, a paste, or a file) goes to GatorPlan’s server for
        that one request. The server reduces it to your programs, completed courses, and unmet requirements. It removes
        your name, UFID, grades, and GPA again if they’re present. It sends that summary, your planning preferences, and
        any notes you type to Anthropic’s Claude API to write the plan. Emails and ID-like numbers in your notes are
        removed first. GatorPlan doesn’t save or log your audit, notes, or plan. When you close or reload the page, they’re
        gone.
      </p>
      <p>
        Anthropic processes that request as our service provider under its{" "}
        <a href="https://www.anthropic.com/legal/commercial-terms">commercial terms</a> and{" "}
        <a href="https://www.anthropic.com/legal/privacy">privacy policy</a>.
      </p>

      <h3>Everything else</h3>
      <ul>
        <li>Browsing courses and building a week schedule needs no account. Your schedule lives only in your open tab.</li>
        <li>
          GatorPlan’s server logs each request’s path, status, and timing, but not your IP address or what you sent. To
          limit degree plans per person, it keeps your IP address in memory for up to an hour.
        </li>
        <li>No analytics, advertising, tracking cookies, or third-party trackers.</li>
      </ul>

      <h2>What we never do</h2>
      <ul>
        <li>Sell or rent your data, or share it for advertising.</li>
        <li>Use it for anything except building your plan, or to decide credit-worthiness or lending.</li>
        <li>Let people read it. Nothing is kept for anyone to read.</li>
      </ul>
      <p className={styles.callout}>
        The use of information received from Google APIs will adhere to the{" "}
        <a href="https://developer.chrome.com/docs/webstore/program-policies/">Chrome Web Store User Data Policy</a>,
        including the{" "}
        <a href="https://developer.chrome.com/docs/webstore/program-policies/limited-use/">Limited Use requirements</a>.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If our data practices change, we’ll update this page and the extension will ask for your consent again before it
        reads anything. Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </main>
  );
}
