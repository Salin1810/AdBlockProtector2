"use strict";

if (/firefox/i.test(navigator.userAgent)) {
    const chrome = window.chrome || window.browser;

    chrome.webRequest.onHeadersReceived.addListener((details) => {
        if (!details.responseHeaders) {
            return;
        }

        for (let i = 0; i < details.responseHeaders.length; i++) {
            if (details.responseHeaders[i].name === "Content-Security-Policy") {
                let rules = details.responseHeaders[i].value.split(";");
                rules = rules.map((x) => x.trim()).filter((x) => x.length > 0);

                rules = rules.map((rule) => {
                    if (rule.startsWith("script-src") && !rule.includes("'unsafe-inline'")) {
                        rule = rule.replace("script-src", "script-src 'unsafe-inline'");
                    }
                    if (rule.startsWith("default-src") && !rule.includes("'unsafe-inline'")) {
                        rule = rule.replace("default-src", "default-src 'unsafe-inline'");
                    }
                    return rule;
                });

                details.responseHeaders[i].value = rules.join(";");
                return { responseHeaders: details.responseHeaders };
            }
        }
    }, { url: "<all urls>" }, ["blocking", "responseHeaders"]);
}
