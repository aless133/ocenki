// requestAnimationFrame is suspended in background tabs. Poll rendered visibility
// with a timer, then use Puppeteer's actual mouse input rather than DOM .click().
async function waitForVisible(page, selector) {
  await page.waitForFunction(selector => {
    const element = document.querySelector(selector);
    if (!element) return false;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.visibility !== 'collapse' &&
      element.getClientRects().length > 0 && box.width > 0 && box.height > 0;
  }, { polling: 100 }, selector);
}

async function clickVisible(page, selector) {
  await waitForVisible(page, selector);
  await page.click(selector);
}

module.exports = { waitForVisible, clickVisible };
