"use strict";

if (/firefox/i.test(navigator.userAgent)) {
    const _beforeScript = a.beforeScript;
    a.beforeScript = (handler) => {
        _beforeScript((node, target, observer) => {
            const _remove = node.remove;
            node.remove = () => {
                node.textContent = "";
                _remove.call(node);
            };

            return handler(node, target, observer);
        });
    };
}
