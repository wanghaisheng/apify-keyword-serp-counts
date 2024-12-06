import { Actor } from 'apify';
import { PuppeteerCrawler } from 'crawlee';

// Initialize the Actor
await Actor.init();

// Get input from the Actor, expecting a list of keywords
const input = await Actor.getInput();
const keywords = input?.keywords || [];

if (!Array.isArray(keywords) || keywords.length === 0) {
    throw new Error('Input must include a "keywords" array with at least one keyword.');
}

// Create a proxy configuration
const proxyConfiguration = await Actor.createProxyConfiguration();

// Prepare to store results
const results = [];

// Create a PuppeteerCrawler
const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    requestHandler: async ({ page, request }) => {
        const { keyword, searchType } = request.userData;

        try {
            // Wait for the results page to load
            await page.waitForSelector('#result-stats', { timeout: 10000 });

            // Extract the result count from the page
            const resultStats = await page.$eval('#result-stats', el => el.textContent);
            const match = resultStats.match(/About ([\d,]+) results/);
            const count = match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;

            // Store the result
            results.push({ keyword, searchType, count });
            console.log(`Keyword: "${keyword}", Search Type: "${searchType}", Count: ${count}`);
        } catch (error) {
            console.error(`Failed to process keyword "${keyword}" for "${searchType}": ${error.message}`);
            results.push({ keyword, searchType, count: 0 });
        }
    },
});

// Construct start URLs for both "intitle" and "allintitle"
const startUrls = keywords.flatMap(keyword => [
    {
        url: `https://www.google.com/search?q=intitle%3A%22${encodeURIComponent(keyword.replace(/\s+/g, '+'))}%22`,
        userData: { keyword, searchType: 'intitle' },
    },
    {
        url: `https://www.google.com/search?q=allintitle%3A%22${encodeURIComponent(keyword.replace(/\s+/g, '+'))}%22`,
        userData: { keyword, searchType: 'allintitle' },
    },
]);

// Process the start URLs in batches with random delays
for (let i = 0; i < startUrls.length; i += 10) {
    const batch = startUrls.slice(i, i + 10);
    console.log(`Processing batch ${Math.floor(i / 10) + 1} of ${Math.ceil(startUrls.length / 10)}`);
    await crawler.run(batch);

    // Sleep for a random time between 1 to 5 seconds after processing a batch
    if (i + 10 < startUrls.length) { // Skip sleep after the last batch
        const sleepTime = Math.random() * (5000 - 1000) + 1000; // Random between 1-5 seconds
        console.log(`Sleeping for ${Math.round(sleepTime / 1000)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, sleepTime));
    }
}

// Save results to the default key-value store
await Actor.setValue('OUTPUT', results);

// Exit the Actor
await Actor.exit();
