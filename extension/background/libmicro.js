/**

libmicro, an embeddable firewall for modern browser extensions
Copyright (C) 2017 jspenguin2017

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

**/


/**

libmicro is compatible with

Chromium 62+
Chrome   62+
Opera    48+
Quantum  57+


libmicro needs these permissions

<all_urls>
storage
unlimitedStorage
tabs
webNavigation
webRequest
webRequestBlocking


libmicro does not create other global variable other than its
namespace, Micro.
libmicro will prepend "libmicro_" to all extension storage entries.

This script is the background script of libmicro, it is expected
to run before other scripts of your extension.

**/


"use strict";


/**
 * libmicro main namespace.
 * @const {Namespace}
 */
var Micro = {};
/**
 * Whether libmicro is initialized.
 * @var {boolean}
 */
Micro.initialized = false;
/**
 * Whether debug mode is activated.
 * @var {boolean}
 */
Micro.debug = false;


/**
 * The chrome namespace.
 * @const {Namespace}
 */
Micro.chrome = window.chrome;
/**
 * Configuration and assets.
 * @var {Array.<Micro.Filter>}
 * @var {Array.<Micro.Asset>}
 */
Micro.config = [];
Micro.assets = [];
/**
 * Tab store.
 * @var {Object.<Object.<string>>}
 */
Micro.tabs = {};


/**
 * Initialize or reinitialize libmicro.
 * @async @function
 */
Micro.init = async () => {
    const chrome = Micro.chrome;

    if (Micro.initialized) {
        Micro.reset();
    }
    Micro.initialized = true;

    parseConfig: {
        let [config, assets] = await new Promise((resolve, reject) => {
            chrome.storage.local.get(["libmicro_config", "libmicro_assets"], (items) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve([
                        items.libmicro_config || "",
                        items.libmicro_assets || "",
                    ]);
                }
            });
        });

        Micro.config = [];
        Micro.assets = [];

        let invalidConfig = 0;
        config.split("\n").map((x) => x.trim()).filter((x) => x.length > 0).forEach((line) => {
            if (line.startsWith("!") || (line.startsWith("#") && !line.startsWith("##"))) {
                return;
            }

            try {
                Micro.config.push(new Micro.Filter(line));
            } catch (err) {
                invalidConfig++;
                if (Micro.debug) {
                    // Do not abort, as I do not want one bad filter to crash everything
                    console.error("libmicro could not parse the configuration '" + line + "' because");
                    console.error(err);
                    console.trace();
                }
            }
        });
        if (invalidConfig > 0) {
            console.warn("libmicro could not parse " + invalidConfig.toString() + " filters");
        }

        let buffer = [];
        assets = assets.split("\n").map((x) => x.trim());
        assets.push("");
        assets.forEach((line) => {
            if (line.startsWith("#")) {
                return;
            }

            if (line.length === 0) {
                if (buffer.length > 0) {
                    const [name, type] = buffer.shift().split(" ");
                    Micro.assets.push(new Micro.Asset(name, type, buffer.join(""), type.includes(";base64")));
                    buffer = [];
                }
                return;
            }

            buffer.push(line);
        });
    }

    setupListeners: {
        Micro.tabs = {};

        await new Promise((resolve, reject) => {
            let runningQueries = 0;

            chrome.tabs.query({}, (existingTabs) => {
                for (let i = 0; i < existingTabs.length; i++) {
                    const id = existingTabs[i].id;
                    if (id !== chrome.tabs.TAB_ID_NONE) {
                        if (!Micro.tabs[id]) {
                            Micro.tabs[id] = {};
                        }
                        Micro.tabs[id][0] = Micro.tabs[id][0] || existingTabs[i].url;

                        runningQueries++;
                        chrome.webNavigation.getAllFrames({ tabId: id }, (frames) => {
                            if (!chrome.runtime.lastError && Micro.tabs[id]) {
                                for (let ii = 0; ii < frames.length; ii++) {
                                    Micro.tabs[id][frames[ii].frameId] = Micro.tabs[id][frames[ii].frameId] || frames[ii].url;
                                }
                            }

                            runningQueries--;
                            if (runningQueries === 0) {
                                resolve();
                            }
                        });
                    }
                }

                if (runningQueries === 0) {
                    resolve();
                }
            });
        });

        chrome.webNavigation.onCommitted.addListener(Micro.onCommitted);
        chrome.tabs.onRemoved.addListener(Micro.onRemoved);

        chrome.webRequest.onBeforeRequest.addListener(Micro.onBeforeRequest, { urls: ["<all_urls>"] }, ["blocking"]);
    }
};
/**
 * Teardown libmicro.
 * @function
 */
Micro.teardown = () => {
    const chrome = Micro.chrome;

    if (!Micro.initialized) {
        throw new Error("libmicro is not initialized");
    }
    Micro.initialized = false;

    Micro.config = [];
    Micro.assets = [];

    Micro.tabs = {};

    chrome.webNavigation.onCommitted.removeListener(Micro.onCommitted);
    chrome.tabs.onRemoved.removeListener(Micro.onRemoved);

    chrome.webRequest.onBeforeRequest.removeListener(Micro.onBeforeRequest);
};
/**
 * Set configuration data, will take effect on the next Micro.init().
 * @async @function
 * @param {string} config - The configuration data.
 */
Micro.setConfig = async (config) => {
    const chrome = Micro.chrome;

    await new Promise((resolve, reject) => {
        chrome.storage.local.set({ libmicro_config: config }, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
};
/**
 * Set assets data, will take effect on the next Micro.init().
 * @async @function
 * @param {string} assets - The assets data.
 */
Micro.setAssets = async (assets) => {
    const chrome = Micro.chrome;

    await new Promise((resolve, reject) => {
        chrome.storage.local.set({ libmicro_assets: assets }, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
};


/**
 * Committed event handler.
 * @function
 * @param {Object} details - The event details.
 */
Micro.onCommitted = (details) => {
    if (!Micro.tabs[details.tabId]) {
        Micro.tabs[details.tabId] = {};
    }
    Micro.tabs[details.tabId][details.frameId] = details.url;
};
/**
 * Remove event handler
 * @function
 * @param {integer} id - The tab that was removed.
 */
Micro.onRemoved = (id) => {
    delete Micro.tabs[id];
};
/**
 * Before request event handler.
 * @function
 * @param {Object} details - The event details.
 * @return {Object|undefined} The decision.
 */
Micro.onBeforeRequest = (details) => {
    let requester = details.documentUrl || details.originUrl;
    if (!requester) {
        requester = Micro.getTabURL(details.tabId, details.frameId);
    }

    if (requester.length > 0 && !/^https?:\/\//.test(requester)) {
        return;
    }

    for (let i = 0; i < Micro.config.length; i++) {
        const filter = Micro.config[i];

        if (filter.match(requester, details.url, details.type)) {
            let redirect = filter.redirect;

            // Quantum does not allow cancellation of document request
            if ((details.type === "main_frame" || details.type === "sub_frame") &&
                /firefox/i.test(navigator.userAgent)) {
                redirect = "libmicro-frame-blocked";
            }


            if (redirect !== "") {
                for (let j = 0; j < Micro.assets.length; j++) {
                    const asset = Micro.assets[j];

                    if (asset.name === redirect) {
                        if (Micro.debug) {
                            console.log("libmicro performed a redirect, from '" + details.url +
                                "' to '" + redirect + "'");
                        }

                        return { redirectUrl: asset.payload };
                    }
                }

                if (Micro.debug) {
                    console.error("libmicro could not find asset '" + redirect + "'");
                }
            }

            if (Micro.debug) {
                console.log("libmicro canceled a request to '" + details.url + "'");
            }
            return { cancel: true };
        }
    }
};


/**
 * Get the URL of a frame of a tab.
 * @function
 * @param {integer} tab - The ID of the tab.
 * @param {integer} frame - The ID of the frame.
 * @return {string} The URL of the tab, or an empty string if it is not known.
 */
Micro.getTabURL = (tab, frame) => {
    if (Micro.tabs[tab]) {
        return Micro.tabs[tab][frame] || "";
    } else {
        return "";
    }
};


/**
 * Filter class.
 * @class
 */
Micro.Filter = class {
    /**
     * Constructor of the filter class.
     * @constructor
     * @param {string} str - The filter string
     */
    constructor(str) {
        /**
         * The domain matcher.
         * @private @prop
         * @const {RegExp}
         */
        this.re;
        /**
         * Domain restriction.
         * @private @prop
         * @const {Array.<string>}
         */
        this.domainsMatch = [];
        this.domainsUnmatch = [];
        /**
         * Type restriction.
         * @private @prop
         * @const {Array.<string>}
         */
        this.typeMatch = [];
        this.typeUmatch = [];
        /**
         * The redirection target.
         * @private @prop
         * @const {string}
         */
        this.redirect = "";


        const optionAnchor = str.lastIndexOf("$");
        let matcher = str.substring(0, optionAnchor).trim();
        let options = str.substring(optionAnchor + 1).trim().split(",").map((x) => x.trim());

        if (matcher.startsWith("@@")) {
            throw new Error("libmicro does not handle white list");
        }


        processOptions: {
            options.forEach((o) => {
                const negated = o.startsWith("~");
                o = o.replace(/^~/, "");

                if (o === "important") {
                    return;
                }

                if (o === "first-party") {
                    if (negated) {
                        this.domainsUnmatch.push("'self'");
                    } else {
                        this.domainsMatch.push("'self'");
                    }
                    return;
                }
                if (o === "third-party") {
                    if (negated) {
                        this.domainsMatch.push("'self'");
                    } else {
                        this.domainsUnmatch.push("'self'");
                    }
                    return;
                }

                if (o.startsWith("redirect=")) {
                    this.redirect = o.substring(9);
                    return;
                }

                if (o.startsWith("domain=")) {
                    o = o.substring(7);
                    o.split(",").map((x) => x.trim()).forEach((d) => {
                        if (d.startsWith("~")) {
                            this.domainsUnmatch.push(d.substring(1));
                        } else {
                            this.domainsMatch.push(d);
                        }
                    });
                    return;
                }

                const normalizedType = this.getNormalizedType(o);
                if (normalizedType !== null) {
                    if (negated) {
                        this.typeUnmatch.push(normalizedType);
                    } else {
                        this.typeMatch.push(normalizedType);
                    }
                    return;
                }

                throw new Error("libmicro does not accept '" + o + "' option");
            });

            if (this.domainsMatch.includes("'self'") && this.domainsUnmatch.includes("'self'")) {
                throw new Error("libmicro only accepts one of 'first-party' and 'third-party' options");
            }
            if (this.domainsMatch.includes("'self'") && this.domainsMatch.length > 1) {
                throw new Error("libmicro only accepts one of 'first-party' and 'domain' options");
            }
            if (this.domainsUnmatch.includes("'self'") && this.domainsUnmatch.length > 1) {
                throw new Error("libmicro only accepts one of 'third-party' and 'domain' options");
            }
        }


        processMatcher: {
            if (matcher === "" || matcher === "*") {
                this.re = /[\s\S]/;
                break processMatcher;
            }

            if (matcher.length > 2 && matcher.startsWith("/") && matcher.endsWith("/")) {
                this.re = new RegExp(matcher.slice(1, -1), "i");
                break processMatcher;
            }

            let reStr1 = "";
            let reStr2 = "";

            // Start anchor
            if (matcher.startsWith("|")) {
                reStr1 += "^";
                matcher = matcher.substring(1);
            }
            // Domain anchor, must be processed after start anchor
            if (matcher.startsWith("|")) {
                reStr1 += "https?:\\/\\/(?:[^./]+(?:\\.))*";
                matcher = matcher.substring(1);
            }
            // End anchor
            if (matcher.endsWith("|")) {
                reStr2 = "$" + reStr2;
                matcher = matcher.slice(0, -1);
            }

            // General RegExp escape
            matcher = matcher.replace(/[\\$+?.()|[\]{}]/g, '\\$&');
            // Wildcard matcher
            matcher = matcher.replace(/\*/g, "[\\s\\S]*");
            // Special character matcher
            matcher = matcher.replace(/\^/g, "(?:[/:?=&]|$)");

            this.re = new RegExp(reStr1 + matcher + reStr2, "i");
        }
    }

    /**
     * Get normalized type.
     * @private @method
     * @param {string} type - The type to normalize.
     * @return {string|null} The normalized type.
     */
    getNormalizedType(type) {
        switch (type) {
            case "main_frame":
            case "document":
                return "main_frame";

            case "sub_frame":
            case "subdocument":
                return "sub_frame";

            case "stylesheet":
                return "stylesheet";

            case "script":
                return "script";

            case "image":
                return "image";

            case "font":
                return "font";

            case "object":
            case "object-subrequest":
                return "object";

            case "xmlhttprequest":
                return "xmlhttprequest";

            case "ping":
                return "ping";

            case "csp_report":
            case "csp-report":
            case "cspreport":
                return "csp_report";

            case "media":
                return "media";

            case "websocket":
                return "websocket";

            case "other":
            case "beacon":
                return "other";

            default:
                return null;
        }
    }

    /**
     * Check if two origin are the same.
     * @private @method
     * @param {string} a - The first origin.
     * @param {string} b - The second origin.
     * @param {boolean} [noSwap=false] - Set to true will always return false if the first
     ** origin is shorter.
     * @return {boolean} Whether the two origins are the same.
     */
    areSameOrigin(a, b, noSwap = false) {
        if (!noSwap && b.length > a.length) {
            const temp = a;
            a = b;
            b = temp;
        }

        if (a === b) {
            return true;
        }
        if (a.endsWith(b) && a.charAt(a.length - b.length - 1) === '.') {
            return true;
        }

        return false;
    }
    /**
     * Check if a request should be blocked.
     * @method
     * @param {string} requester - The requester URL.
     * @param {string} destination - The destination (requested) URL.
     * @param {string} type - The type of the destination resource.
     * @return {boolean} Whether this request should be blocked.
     */
    match(requester, destination, type) {
        const domainExtractor = /^https?:\/\/([^/]+)/;

        matchParty: {
            let requesterOrigin = domainExtractor.exec(requester);
            if (requesterOrigin === null) {
                return false;
            } else {
                requesterOrigin = requesterOrigin[1];
            }

            let destinationOrigin = domainExtractor.exec(destination);
            if (destinationOrigin === null) {
                return false;
            } else {
                destinationOrigin = destinationOrigin[1];
            }

            if (this.domainsMatch[0] === "'self'" && !this.areSameOrigin(requesterOrigin, destinationOrigin)) {
                return false;
            }
            if (this.domainsUnmatch[0] === "'self'" && this.areSameOrigin(requesterOrigin, destinationOrigin)) {
                return false;
            }
        }

        matchOrigin: {
            let matched;
            if (this.domainsMatch.length) {
                matched = this.domainsMatch.some((d) => {
                    if (this.areSameOrigin(requesterOrigin, d, true)) {
                        return true;
                    }
                });
            } else {
                matched = true;
            }

            let unmatched;
            if (this.domainsUnmatch.length) {
                unmatched = this.domainsUnmatch.some((d) => {
                    if (this.areSameOrigin(requesterOrigin, d, true)) {
                        return true;
                    }
                });
            } else {
                unmatched = false;
            }

            if (!matched || unmatched) {
                return false;
            }
        }

        matchType: {
            let matched;
            if (this.typeMatch.length) {
                matched = this.typeMatch.includes(type);
            } else {
                matched = true;
            }

            let unmatched;
            if (this.typeUmatch.length) {
                unmatched = this.typeUmatch.includes(type);
            } else {
                unmatched = false;
            }

            if (!matched || unmatched) {
                return false;
            }
        }

        return this.re.test(destination);
    }
};
/**
 * Asset class.
 * @class
 */
Micro.Asset = class {
    /**
     * Constructor of the filter class.
     * @constructor
     * @param {string} name - The name of this asset.
     * @param {string} type - The type string.
     * @param {string} payload - The raw payload data.
     * @param {boolean} [encode=false] - Whether the raw payload should be encoded.
     */
    constructor(name, type, payload, encode = false) {
        /**
         * The name of this asset.
         * @prop
         * @const {string}
         */
        this.name = name;
        /**
         * The processed payload of this asset.
         * @prop
         * @const {string}
         */
        this.payload = "";

        this.payload += "data:" + type +
            (encode ? "" : ";base64") + "," +
            (encode ? payload : btoa(payload));
    }
};
