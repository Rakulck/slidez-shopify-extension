import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

export const MONTHLY_PLAN_GROWTH = "Growth";
export const MONTHLY_PLAN_PRO = "Pro";
export const MONTHLY_PLAN_ENTERPRISE = "Enterprise";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [MONTHLY_PLAN_GROWTH]: {
      lineItems: [
        {
          amount: 49.0,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    [MONTHLY_PLAN_PRO]: {
      lineItems: [
        {
          amount: 99.0,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
      trialDays: 7,
    },
    [MONTHLY_PLAN_ENTERPRISE]: {
      lineItems: [
        {
          amount: 249.0,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
        {
          amount: 1000.0, // Maximum usage cap
          currencyCode: "USD",
          interval: BillingInterval.Usage,
          terms: "$0.08 per try-on after 2,500 monthly included try-ons",
        },
      ],
      trialDays: 7,
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
