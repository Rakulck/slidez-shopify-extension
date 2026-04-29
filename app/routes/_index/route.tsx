import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};

function IconArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const benefits = [
  "Works with any product category",
  "No coding required — live in minutes",
  "Reduce returns, increase conversions",
];

export default function Index() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <main className={styles.page}>
      <div className={styles.container}>

        {/* Logo */}
        <div className={styles.logoWrap}>
          <img
            src="/logo.png"
            alt="Slidez"
            className={styles.logo}
            width={200}
            height={200}
          />
        </div>

        {/* Hero */}
        <section className={styles.hero} aria-labelledby="hero-heading">
          <h1 id="hero-heading" className={styles.heading}>
            AI Virtual<br />Try&#8209;On
          </h1>
        </section>

        {/* Benefits */}
        <ul className={styles.benefits} aria-label="Key benefits">
          {benefits.map((b, i) => (
            <li key={i} className={styles.benefitItem} style={{ animationDelay: `${0.12 + i * 0.06}s` }}>
              <span className={styles.checkIcon}><IconCheck /></span>
              {b}
            </li>
          ))}
        </ul>

        {/* Install form */}
        {showForm && (
          <section className={styles.formSection} aria-label="Install the app">
            <Form method="post" action="/auth/login" className={styles.form}>
              <div className={styles.inputRow}>
                <label htmlFor="shop-input" className={styles.srOnly}>
                  Your Shopify store domain
                </label>
                <input
                  id="shop-input"
                  className={styles.input}
                  type="text"
                  name="shop"
                  placeholder="your-store.myshopify.com"
                  autoComplete="url"
                  spellCheck={false}
                  required
                />
                <button className={styles.button} type="submit">
                  <span>Install App</span>
                  <IconArrowRight />
                </button>
              </div>
            </Form>
            <p className={styles.sub}>
              Let shoppers see how products look on them before buying.
              Increase conversions, reduce returns, and elevate the shopping
              experience, designed for Shopify stores.
            </p>
          </section>
        )}

        {/* Footer */}
        <footer className={styles.footer}>
          <span>© {new Date().getFullYear()} Slidez. All rights reserved.</span>
        </footer>

      </div>
    </main>
  );
}
