// ==UserScript==
// @name           Fimfiction Comments Plus
// @description    Enhanced comments for Fimfiction
// @author         Pluie
// @version        0.0.1
// @homepageURL    https://github.com/PluieElectrique/fimfic-comments-plus
// @downloadURL    https://github.com/PluieElectrique/fimfic-comments-plus/raw/master/commentsplus.user.js
// @updateURL      https://github.com/PluieElectrique/fimfic-comments-plus/raw/master/commentsplus.user.js
// @match          *://www.fimfiction.net/*
// @grant          unsafeWindow
// @run-at         document-end
// ==/UserScript==

let App = unsafeWindow.App;

function smuggle(f) {
    if (typeof exportFunction !== "function") {
        return f;
    } else {
        // Firefox requires us to export any functions which will be called by code in the page's
        // scope (this includes functions passed as callbacks). Functions which are called by
        // exported functions do not have to be exported.
        return exportFunction(f, window);
    }
}

let pagesStored = [];
let comments = {};

function rewriteQuoteLinks(elem) {
    for (let quoteLink of elem.querySelectorAll(".comment_quote_link:not(.comment_callback)")) {
        let meta = comments[quoteLink.dataset.comment_id];
        if (meta !== undefined) {
            quoteLink.textContent = meta.author;
        }
    }
}

// A collection of methods that will be assigned onto the real comment controller
let commentControllerShell = {
    getComment: smuggle(function(id) {
        let comment = document.getElementById("comment_" + id);
        if (comment !== null) {
            return new Promise(f => f(comment));
        }

        return Object.getPrototypeOf(this).getComment
            .call(this, id)
            .then(smuggle(comment => {
                let meta = comments[id];
                if (meta !== undefined) {
                    // Rewrite comment index
                    comment.querySelector(`[href='#comment/${id}']`).textContent = "#" + meta.index;
                }
                rewriteQuoteLinks(comment);
                return comment;
            }));
    }),

    setupQuotes: smuggle(function() {
        Object.getPrototypeOf(this).setupQuotes.call(this);
        rewriteQuoteLinks(document);
        this.storeComments();
    }),

    goToPage: smuggle(function(num) {
        this.storeComments();
        Object.getPrototypeOf(this).goToPage.call(this, num);
    }),

    // Extra methods for ease of accessing `this`
    storeComments: function() {
        if (pagesStored[this.currentPage]) return;
        pagesStored[this.currentPage] = true;

        let ordering, startIndex;
        if (this.order === "ASC") {
            ordering = 1;
            startIndex = Number(document.querySelector(".start-index").textContent);
        } else {
            ordering = -1;
            startIndex = Number(document.querySelector(".end-index").textContent);
        }

        document.querySelectorAll(".comment").forEach((comment, i) => {
            // Is this a deleted comment?
            if (comment.childElementCount === 2) return;

            comments[comment.dataset.comment_id] = {
                author: comment.dataset.author,
                index: startIndex + ordering * i
            };
        });
    }
};

function setupObservers() {
    // In ASC ordering, .end-index is incorrectly rounded up to the nearest multiple of 50. It would
    // be best to fix this by chaining a Promise onto goToPage. However, .end-index is set after the
    // Promise callback is called, so we must observe the change instead.
    let observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            let numComments = Number(document.querySelector(".num-comments").textContent);
            let elem = mutation.target;
            if (Number(elem.textContent) > numComments) {
                elem.textContent = numComments;
            }
        });
    });
    document.querySelectorAll(".end-index").forEach(elem => {
        // Changing textContent fires a childList event (removing and adding text nodes). It does not
        // fire a characterData event as you might expect.
        observer.observe(elem, { childList: true });
    });
}

let storyComments = document.getElementById("story_comments");
if (storyComments !== null) {
    let commentController = App.createdControllers[storyComments.dataset.controllerId];
    Object.assign(commentController, commentControllerShell);

    setupObservers();
}
