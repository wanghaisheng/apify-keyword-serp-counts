import { Actor } from 'apify';
import { PuppeteerCrawler, CheerioCrawler } from 'crawlee';

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

// Prepare to store results and a retry list
const results = [];
let retryList = [];

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
            if (error.message.includes('429')) {
                console.warn(`Retrying keyword "${keyword}" for "${searchType}" due to 429 error.`);
                retryList.push(request);
            } else {
                console.error(`Failed to process keyword "${keyword}" for "${searchType}": ${error.message}`);
                results.push({ keyword, searchType, count: 0 });
            }
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

// Process the start URLs
await crawler.run(startUrls);

// Retry requests with 429 errors
if (retryList.length > 0) {
    console.log(`Retrying ${retryList.length} requests with the original proxy...`);
    await crawler.run(retryList);
}

// Retry failed requests using an alternative proxy group
if (retryList.length > 0) {
    console.log(`Retrying ${retryList.length} requests with a different proxy configuration...`);
    const altProxyConfiguration = await Actor.createProxyConfiguration({
        groups: ['GOOGLE_SERP'], // Alternative proxy group
    });

    const altCrawler = new CheerioCrawler({
        proxyConfiguration: altProxyConfiguration,
        async requestHandler({ request }) {
            try {
                // Assume response parsing logic
                const response = await request();
                console.log(`Successfully retried: ${request.url}`);
                results.push({ url: request.url, success: true });
            } catch (error) {
                console.error(`Failed to retry: ${request.url}`);
            }
        },
    });

    await altCrawler.run(retryList.map(req => req.url));
}

// Save results to the default key-value store
await Actor.setValue('OUTPUT', results);

// Exit the Actor
await Actor.exit();
