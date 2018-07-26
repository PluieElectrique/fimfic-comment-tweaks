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
let CommentListController = unsafeWindow.CommentListController;

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

// Clone a comment without any expanded quote links or callbacks
function cloneComment(comment) {
    let comment_callbacks = comment.querySelector(".comment_callbacks");
    let data = comment.querySelector(".data");

    let callbackQuotes = [];
    for (let quote of comment_callbacks.querySelectorAll(".inline-quote")) {
        callbackQuotes.push(comment_callbacks.removeChild(quote));
    }
    let linkQuotes = [];
    for (let quote of data.querySelectorAll(".inline-quote")) {
        linkQuotes.push(quote.parentNode.removeChild(quote));
    }

    let clone = comment.cloneNode(true);
    clone.removeAttribute("id");

    for (let quote of callbackQuotes) {
        comment_callbacks.appendChild(quote);
    }
    if (linkQuotes.length !== 0) {
        for (let link of data.querySelectorAll(".comment_quote_link")) {
            fQuery.insertAfter(link, linkQuotes.shift());
        }
    }
    return clone;
}

// A collection of methods that will be assigned onto the real comment controller
let commentControllerShell = {
    // Methods that shadow existing methods
    getComment: smuggle(function(id) {
        let comment = document.getElementById("comment_" + id);
        if (comment !== null) {
            return new Promise(f => f(comment));
        }

        return this.prototype.getComment.call(this, id).then(
            smuggle(comment => {
                let meta = comments[id];
                if (meta !== undefined) {
                    // Rewrite comment index
                    comment.querySelector(`[href='#comment/${id}']`).textContent = "#" + meta.index;
                }
                rewriteQuoteLinks(comment);
                return comment;
            })
        );
    }),

    setupQuotes: smuggle(function() {
        this.prototype.setupQuotes.call(this);
        rewriteQuoteLinks(document);
        this.storeComments();
    }),

    goToPage: smuggle(function(num) {
        this.storeComments();
        this.prototype.goToPage.call(this, num);
    }),

    beginShowQuote: smuggle(function(quoteCallback) {
        // Just in case a mouseover event is triggered before the last mouseover's mouseout has
        this.endShowQuote();

        let cancel = false;
        this.getComment(quoteCallback.dataset.comment_id).then(comment => {
            if (cancel) return;

            this.quote_container.classList.remove("hidden");
            if (this.quote_container.firstChild !== null) {
                this.quote_container.removeChild(this.quote_container.firstChild);
            }

            this.quote_container.appendChild(cloneComment(comment));

            let parentCommentRect = fQuery.closestParent(quoteCallback, ".comment").getBoundingClientRect();
            let style = this.quote_container.style;
            style.top = quoteCallback.getBoundingClientRect().top + fQuery.scrollTop() + 20 + "px";
            style.left = parentCommentRect.left - 20 + "px";
            style.width = parentCommentRect.width + 40 + "px";

            App.DispatchEvent(this.quote_container, "loadVisibleImages");
        });

        return function() {
            cancel = true;
        };
    }),

    expandQuote: smuggle(function(quoteCallback) {
        this.endShowQuote();

        let id = quoteCallback.dataset.comment_id;

        let inlineComment = quoteCallback.parentNode.querySelector(`.comment[data-comment_id='${id}']`);
        if (inlineComment === null) {
            let containerComment = this.quote_container.firstChild;

            if (containerComment === null) {
                this.getComment(id).then(comment => {
                    let clone = cloneComment(comment);
                    clone.classList.add("inline-quote");
                    fQuery.insertAfter(quoteCallback, clone);
                });
            } else {
                this.quote_container.removeChild(containerComment);
                containerComment.classList.add("inline-quote");
                fQuery.insertAfter(quoteCallback, containerComment);
            }
        } else {
            inlineComment.parentNode.removeChild(inlineComment);
        }
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
    },

    // For ease of calling methods on the prototype
    prototype: CommentListController.prototype
};

function setupObservers() {
    // In ASC ordering, .end-index is incorrectly rounded up to the nearest multiple of 50. It would
    // be best to fix this by chaining a Promise onto goToPage. However, .end-index is set after the
    // Promise callback is called, so we must observe the change instead.
    let observer = new MutationObserver(mutations => {
        let numComments = Number(document.querySelector(".num-comments").textContent);
        for (let mutation of mutations) {
            let elem = mutation.target;
            if (Number(elem.textContent) > numComments) {
                elem.textContent = numComments;
            }
        }
    });
    for (let elem of document.querySelectorAll(".end-index")) {
        // Changing textContent fires a childList event (removing and adding text nodes). It does not
        // fire a characterData event as you might expect.
        observer.observe(elem, { childList: true });
    }
}

// Reduce padding on the right of comments to increase usable width when nesting.
let cssCode = ".comment .data { padding-right: 0.3rem; }";
function injectCSS() {
    let style = document.createElement("style");
    style.type = "text/css";
    style.textContent = cssCode;
    document.head.appendChild(style);
}

function initializeElements(controller) {
    if (controller.quote_container === null) {
        let container = document.createElement("div");
        container.className = "quote_container";
        document.body.appendChild(container);
        controller.quote_container = container;
    }
}

let storyComments = document.getElementById("story_comments");
if (storyComments !== null) {
    let commentController = App.GetControllerFromElement(storyComments);
    Object.assign(commentController, commentControllerShell);

    setupObservers();
    injectCSS();
    initializeElements(commentController);
}
