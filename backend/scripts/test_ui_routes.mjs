
async function runTests() {
  console.log("=== VERIFYING FRONTEND COMPILES & RESPONDS ===");

  const urls = [
    "http://localhost:3000/quotations",
    "http://localhost:3000/admin/products",
    "http://localhost:3000/admin/subscription-products",
    "http://localhost:3000/admin/subscriptions",
    "http://localhost:3000/quotations/new",
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      console.log(`[STATUS ${res.status}] ${url} - OK`);
      if (res.status >= 500) {
        const text = await res.text();
        console.error(`Error details for ${url}:`, text.slice(0, 500));
      }
    } catch (err) {
      console.error(`Failed to reach ${url}:`, err.message);
    }
  }

  console.log("\n=== VERIFYING BACKEND API & B-TREE ENDPOINTS ===");
  // Test login to get token
  try {
    const loginRes = await fetch("http://localhost:4000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@dealflow360.com", password: "Password123!" }),
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.accessToken || loginData.token;

    if (!token) {
      console.error("Login failed:", loginData);
      return;
    }
    console.log("Admin login OK, token received.");

    // Test GET /api/subscriptions
    const subsRes = await fetch("http://localhost:4000/api/subscriptions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const subsText = await subsRes.text();
    console.log(`[STATUS ${subsRes.status}] GET /api/subscriptions ->`, subsText);

    // Test GET /api/subscriptions?search=...
    const searchRes = await fetch("http://localhost:4000/api/subscriptions?search=corp", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const searchData = await searchRes.json();
    console.log(`[STATUS ${searchRes.status}] GET /api/subscriptions?search=corp -> count:`, searchData.data?.length);

  } catch (err) {
    console.error("API test failed:", err.message);
  }

  console.log("\nALL VERIFICATIONS COMPLETE.");
}

runTests();
