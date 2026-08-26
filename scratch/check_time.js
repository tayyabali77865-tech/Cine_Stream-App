console.log("Link expiry:", new Date(1786358295 * 1000).toLocaleString());
console.log("Current time:", new Date().toLocaleString());
console.log("Difference (hours):", (1786358295 * 1000 - Date.now()) / (3600 * 1000));
