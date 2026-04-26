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

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      {/* Background decorations */}
      <div className={styles.blob1}></div>
      <div className={styles.blob2}></div>
      
      <div className={styles.content}>
        <div className={styles.logo}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
             <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="url(#paint0_linear)"/>
             <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="url(#paint0_linear)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
             <defs>
               <linearGradient id="paint0_linear" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                 <stop stopColor="#6366f1"/>
                 <stop offset="1" stopColor="#a855f7"/>
               </linearGradient>
             </defs>
          </svg>
          Slidez
        </div>
        <h1 className={styles.heading}>AI Virtual Try-On<br/><span className={styles.gradientText}>for Shopify</span></h1>
        <p className={styles.text}>
          Let shoppers try clothes, accessories, and makeup before buying —
          boost conversions and reduce returns with AI-powered try-on.
        </p>
        
        {showForm && (
          <div className={styles.formWrapper}>
            <Form className={styles.form} method="post" action="/auth/login">
              <label className={styles.label}>
                <span className={styles.labelText}>Enter your store domain</span>
                <input className={styles.input} type="text" name="shop" placeholder="my-shop-domain.myshopify.com" />
              </label>
              <button className={styles.button} type="submit">
                Install App
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </Form>
          </div>
        )}
        
        <ul className={styles.list}>
          <li className={styles.card}>
            <div className={styles.cardIcon}>✨</div>
            <strong>AI Try-On</strong>
            <p>Shoppers upload a photo and instantly see how products look on them — no guesswork, more confidence.</p>
          </li>
          <li className={styles.card}>
            <div className={styles.cardIcon}>📈</div>
            <strong>Higher Conversions</strong>
            <p>Reduce purchase hesitation with an interactive try-on experience that drives more add-to-carts.</p>
          </li>
          <li className={styles.card}>
            <div className={styles.cardIcon}>↩️</div>
            <strong>Fewer Returns</strong>
            <p>When customers know what fits, they keep it — cutting return rates and support costs.</p>
          </li>
        </ul>
      </div>
    </div>
  );
}
