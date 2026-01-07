#!/usr/bin/env node

// Simple test script to verify Fellow API connection

const apiKey = process.env.FELLOW_API_KEY;
const subdomain = process.env.FELLOW_SUBDOMAIN;

if (!apiKey || !subdomain) {
  console.error("Missing FELLOW_API_KEY or FELLOW_SUBDOMAIN environment variables");
  process.exit(1);
}

const baseUrl = `https://${subdomain}.fellow.app/api/v1`;

async function test() {
  console.log(`Testing Fellow API connection...`);
  console.log(`Subdomain: ${subdomain}`);
  console.log(`API Key: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log();

  try {
    // Test listing recordings
    console.log("1. Testing POST /recordings...");
    const recordingsRes = await fetch(`${baseUrl}/recordings`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pagination: { cursor: null, page_size: 5 },
      }),
    });

    console.log(`   Status: ${recordingsRes.status} ${recordingsRes.statusText}`);
    const recordingsData = await recordingsRes.json();
    console.log(`   Response:`, JSON.stringify(recordingsData, null, 2));
    console.log();

    // Test listing notes
    console.log("2. Testing POST /notes...");
    const notesRes = await fetch(`${baseUrl}/notes`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pagination: { cursor: null, page_size: 5 },
      }),
    });

    console.log(`   Status: ${notesRes.status} ${notesRes.statusText}`);
    const notesData = await notesRes.json();
    console.log(`   Response:`, JSON.stringify(notesData, null, 2));

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

test();
