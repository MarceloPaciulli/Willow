/*
 * Willow.js - JSON Tree Viewer
 * Author: Marcelo A. Paciulli
 */

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({
        url: chrome.runtime.getURL("willow.html")
    });
});