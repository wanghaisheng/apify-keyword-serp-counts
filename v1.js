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

// Run the crawler
await crawler.run(startUrls);

// Save results to the default key-value store
await Actor.setValue('OUTPUT', results);

// Exit the Actor
await Actor.exit();
