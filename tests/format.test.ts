// Holds the app's figures to the website's. The formatters below are the ones in
// the website's frontend/src/format.ts, which read decimal strings exactly, so
// any difference here is a figure the app and the website would show differently.
// Run with: npm test

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatDate,
  formatMoney,
  formatPercent,
  formatShares,
  formatShortDate,
  formatSignedMoney,
  formatSignedPercent,
} from "../src/lib/format.ts";

const USD = { style: "currency", currency: "USD" } as const;
const ONE_PLACE = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;
const minus = (text: string) => text.replace("-", "−");

const site = {
  money: new Intl.NumberFormat("en-US", USD),
  signedMoney: new Intl.NumberFormat("en-US", { ...USD, signDisplay: "always" }),
  percent: new Intl.NumberFormat("en-US", ONE_PLACE),
  signedPercent: new Intl.NumberFormat("en-US", { ...ONE_PLACE, signDisplay: "always" }),
  shares: new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }),
};

// Intl's own typing wants a number; at run time it takes the string as it is.
const exact = (value: string) => value as unknown as number;

function sameAsWebsite(value: string): void {
  assert.equal(formatMoney(value), minus(site.money.format(exact(value))), `money ${value}`);
  assert.equal(
    formatSignedMoney(value),
    minus(site.signedMoney.format(exact(value))),
    `signed money ${value}`,
  );
  assert.equal(formatPercent(value), `${minus(site.percent.format(exact(value)))}%`, `% ${value}`);
  assert.equal(
    formatSignedPercent(value),
    `${minus(site.signedPercent.format(exact(value)))}%`,
    `signed % ${value}`,
  );
  if (!value.startsWith("-")) {
    assert.equal(formatShares(value), site.shares.format(exact(value)), `shares ${value}`);
  }
}

test("the values most likely to go wrong match the website", () => {
  for (const value of [
    "0",
    "0.00",
    "0.004",
    "0.005",
    "0.0049999",
    "1.005",
    "1.015",
    "2.675",
    "999.995",
    "999999.995",
    "1000",
    "1234567.891",
    "300.000319",
    "0.13304000",
    "0.000000005",
    "0.000000004",
    "99.95",
    "99.949999",
    "-0.001",
    "-0.005",
    "-1.005",
    "-1234.565",
    "0E-8",
    "1E+2",
    "1.5E+3",
    "-2.5E-3",
  ]) {
    sameAsWebsite(value);
  }
});

test("random decimal strings match the website", () => {
  // A fixed seed, so a failure can be repeated.
  let seed = 20261031;
  const next = (below: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % below;
  };
  for (let run = 0; run < 50000; run += 1) {
    const whole = String(next(10 ** (1 + next(7))));
    const places = next(10);
    let fraction = "";
    for (let digit = 0; digit < places; digit += 1) fraction += String(next(10));
    // Half the fractions end on a 5 right after the cut, where rounding is decided.
    if (places >= 3 && next(2) === 0) fraction = `${fraction.slice(0, 2)}5`;
    const sign = next(4) === 0 ? "-" : "";
    sameAsWebsite(`${sign}${whole}${fraction ? `.${fraction}` : ""}`);
  }
});

test("dates are the calendar day written, in any time zone", () => {
  const site2 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
  for (const day of ["2026-01-01", "2026-09-23", "2023-10-02", "2024-02-29", "2026-12-31"]) {
    const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
    const utc = new Date(Date.UTC(year, month - 1, date));
    assert.equal(formatShortDate(day), site2.format(utc));
    assert.equal(formatDate(day), long.format(utc));
  }
});
