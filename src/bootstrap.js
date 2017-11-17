"use strict";

(async () => {
    const chrome = window.chrome || window.browser;

    if (!Micro) {
        console.error("AdBlock Protector 2 could not find libmicro!");
        return;
    }

    //Micro.debug = true;

    let settings = {};
    loadSetting: {
        try {
            await new Promise((resolve, reject) => {
                chrome.storage.local.get(["config_last_update", "assets_last_update"], (items) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        settings.config_last_update = items.config_last_update || 0;
                        settings.assets_last_update = items.assets_last_update || 0;
                        resolve();
                    }
                });
            });
        } catch (err) {
            console.error("AdBlock Protector 2 could not to read savedata!");
            return;
        }
    }

    initMicro: {
        await Micro.init();

        if (Micro.config.length === 0 || settings.config_last_update + 86400000 < Date.now()) {
            let filter;
            try {
                if (typeof REMOTE_CONFIG !== "string" || REMOTE_CONFIG.length === 0) {
                    throw new Error("No remote filters");
                }

                filter = await fetch(REMOTE_CONFIG);
                filter = filter.text();
            } catch (err) {
                console.error("AdBlock Protector 2 failed to update configuration!");

                // Quantum will freak out if I request a file that does not exist
                //try {
                //    filter = await fetch(chrome.runtime.getURL("config.txt"));
                //    filter = filter.text();
                //} catch (err) { }
            }

            if (filter) {
                // No need to update other stuff
                chrome.storage.local.set({ config_last_update: Date.now() });

                await Micro.setConfig(filter);
                await Micro.init();
            }
        }

        if (Micro.assets.length === 0 || settings.assets_last_update + 86400000 < Date.now()) {
            let assets;

            try {
                if (typeof REMOTE_ASSETS !== "string" || REMOTE_ASSETS.length === 0) {
                    throw new Error("No remote assets");
                }

                // Quantum extension store does not allow remote script
                if (/firefox/i.test(navigator.userAgent)) {
                    throw new Error("Remote script disallowed");
                }

                assets = await fetch(REMOTE_ASSETS);
                assets = assets.text();
            } catch (err) {
                console.error("AdBlock Protector 2 failed to update assets!");

                //try {
                //    assets = await fetch(chrome.runtime.getURL("assets.txt"));
                //    assets = assets.text();
                //} catch (err) { }
            }

            if (assets) {
                chrome.storage.local.set({ assets_last_update: Date.now() });

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

        chrome.management.onInstalled.addListener((info) => {
            if (/ublock origin/i.test(info.name)) {
                Micro.teardown();
            }
        });
        chrome.management.onUninstalled.addListener((info) => {
            if (/ublock origin/i.test(info.name)) {
                Micro.init();
            }
        });

        chrome.management.onEnabled.addListener((info) => {
            if (/ublock origin/i.test(info.name)) {
                Micro.teardown();
            }
        });
        chrome.management.onDisabled.addListener((info) => {
            if (/ublock origin/i.test(info.name)) {
                Micro.init();
            }
        });
    }
})();
