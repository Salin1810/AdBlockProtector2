"use strict";

/**
 * Remote configuration and assets URL.
 * @const {string}
 */
const REMOTE_CONFIG = "";
const REMOTE_ASSETS = "";

(async () => {
    const chrome = window.chrome || window.browser;

    if (!Micro) {
        console.error("AdBlock Protector 2 could not find libmicro!");
        return;
    }

    initMicro: {
        await Micro.init();

        if (Micro.config.length === 0) {
            let filter;
            try {
                filter = await fetch(REMOTE_CONFIG);
                filter = filter.text();
            } catch (err) {
                console.error("AdBlock Protector 2 failed to load configuration!");
            }

            if (filter) {
                await Micro.setConfig(filter);
                await Micro.init();
            }
        }

        if (Micro.assets.length === 0) {
            let assets;

            // Quantum extension store does not allow remote script
            if (/firefox/i.test(navigator.userAgent)) {
                assets = await fetch(chrome.runtime.getURL("assets.txt"));
                assets = assets.text();
            } else {
                try {
                    assets = await fetch(REMOTE_ASSETS);
                    assets = assets.text();
                } catch (err) {
                    console.error("AdBlock Protector 2 failed to load assets!");
                }
            }

            if (assets) {
                await Micro.setAssets(assets);
                await Micro.init();
            }
        }
    }

    checkExtension: {
        const extensions = await new Promise((resolve, reject) => {
            chrome.management.getAll((result) => {
                resolve(result);
            });
        });
        extensions.some((extension) => {
            if (/ublock origin/i.test(extension.name)) {
                Micro.teardown();
                return true;
            }
        });
    }
})();
