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

// In ASC order, .end-index is incorrectly rounded up to the nearest multiple of 50.
// .start-index will be 1 even on a story with 0 comments.
function fixCommentCounts(elem) {
    let numComments = Number(document.querySelector(".num-comments").textContent);
    if (Number(elem.textContent) > numComments) {
        elem.textContent = numComments;
    }
}

// Clone a comment without expanded links, unhidden, no collapse link
function cloneComment(comment) {
    let removeQuotes = root => {
        let quotes = [];
        for (let quote of root.querySelectorAll(".inline-quote")) {
            // Get the link first. If we remove the quote first, then the sibling will be null.
            quotes.push({
                link: quote.previousElementSibling,
                quote: quote.parentNode.removeChild(quote)
            });
        }
        return quotes;
    };
    let addQuotes = (root, quotes) => {
        for (let ql of quotes) {
            fQuery.insertAfter(ql.link, ql.quote);
        }
    };

    let comment_callbacks = comment.querySelector(".comment_callbacks");
    let callbackQuotes = removeQuotes(comment_callbacks);
    let data = comment.querySelector(".data");
    let linkQuotes = removeQuotes(data);

    let clone = comment.cloneNode(true);
    clone.removeAttribute("id");
    clone.classList.remove("forward-hidden");
    clone.classList.remove("collapsed");
    // Remove collapse link and mid-dot
    let meta = clone.querySelector(".meta");
    meta.removeChild(meta.firstChild);
    meta.removeChild(meta.firstChild);

    addQuotes(comment_callbacks, callbackQuotes);
    addQuotes(data, linkQuotes);

    return clone;
}

// Change the expansion count of a comment and hide/unhide if necessary
function forwardHiding(id, change) {
    if (change !== 1 && change !== -1) {
        throw new Error("Change to expand count must be 1 or -1");
    }
    let comment = document.getElementById(id);
    // Foreign comments don't need to be hidden
    if (comment === null) return;
    let dataset = comment.dataset;

    let newCount = Number(dataset.expandCount || 0) + change;
    if (newCount < 0) {
        throw new Error("Expand count cannot be less than 0");
    } else if (newCount === 0) {
        comment.classList.remove("forward-hidden");
    } else if (newCount === 1) {
        comment.classList.add("forward-hidden");
    }

    dataset.expandCount = newCount;
}

function setupCollapseLinks() {
    for (let meta of document.querySelectorAll(".meta")) {
        let middot = document.createElement("b");
        middot.textContent = "\u00b7";
        fQuery.prepend(meta, middot);

        let collapseLink = document.createElement("a");
        collapseLink.classList.add("collapse-link");
        let minus = document.createElement("i");
        minus.classList.add("fa", "fa-minus-square-o");
        collapseLink.appendChild(minus);
        fQuery.prepend(meta, collapseLink);
    }
}

function toggleCollapseCommentTree(comment) {
    collapseCommentTree(comment, !comment.classList.contains("collapsed"));
}
function collapseCommentTree(comment, collapse) {
    if (collapse) {
        comment.classList.add("collapsed");
    } else {
        comment.classList.remove("collapsed");
    }
    let collapseIcon = comment.querySelector(".collapse-link > i");
    collapseIcon.classList.toggle("fa-minus-square-o");
    collapseIcon.classList.toggle("fa-plus-square-o");

    for (let callback of comment.querySelectorAll(".comment_callback")) {
        let id = "comment_" + callback.dataset.comment_id;
        collapseCommentTree(document.getElementById(id), collapse);
    }
}

// Stop propagation of mouse events on comment links
function stopPropagation(evt) {
    evt.stopPropagation();
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
        setupCollapseLinks();
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

            let parentCommentRect = fQuery
                .closestParent(quoteCallback, ".comment")
                .getBoundingClientRect();
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

    expandQuote: smuggle(function(quoteLink) {
        let addComment = comment => {
            quoteLink.addEventListener("mouseover", stopPropagation);
            quoteLink.addEventListener("mouseout", stopPropagation);

            // Prevent the expansion of the parent from the child quote
            let parentId = fQuery.closestParent(quoteLink, ".comment").dataset.comment_id;
            let childLink = comment.querySelector(
                `.comment_callback[data-comment_id='${parentId}']`
            );
            // Foreign comments currently don't have callbacks
            if (childLink !== null) {
                childLink.style.textDecoration = "underline";
                childLink.addEventListener("mouseover", stopPropagation);
                childLink.addEventListener("mouseout", stopPropagation);
                childLink.addEventListener("click", evt => {
                    evt.stopPropagation();
                    evt.preventDefault();
                });
            }
            comment.classList.add("inline-quote");

            fQuery.insertAfter(quoteLink, comment);
        };

        this.endShowQuote();

        let id = quoteLink.dataset.comment_id;

        let inlineComment = quoteLink.parentNode.querySelector(`.comment[data-comment_id='${id}']`);
        if (inlineComment === null) {
            let containerComment = this.quote_container.firstChild;

            if (containerComment === null) {
                this.getComment(id).then(comment => {
                    addComment(cloneComment(comment));
                    forwardHiding("comment_" + id, 1);
                });
            } else {
                this.quote_container.removeChild(containerComment);
                addComment(containerComment);
                forwardHiding("comment_" + id, 1);
            }
        } else {
            inlineComment.parentNode.removeChild(inlineComment);
            quoteLink.removeEventListener("mouseover", stopPropagation);
            quoteLink.removeEventListener("mouseout", stopPropagation);
            forwardHiding("comment_" + id, -1);
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
            if (comment.firstElementChild.classList.contains("message")) return;

            comments[comment.dataset.comment_id] = {
                author: comment.dataset.author,
                index: startIndex + ordering * i
            };
        });
    },

    // For ease of calling methods on the prototype
    prototype: CommentListController.prototype
};

function setupHandlers() {
    fQuery.addScopedEventListener(
        document.querySelector(".comment_list"),
        ".collapse-link",
        "click",
        evt => toggleCollapseCommentTree(fQuery.closestParent(evt.target, ".comment"))
    );

    // We would like to chain a Promise onto goToPage, but .end-index is set after the Promise
    // callback is called, so we must observe the change instead.
    let observer = new MutationObserver(mutations => {
        for (let mutation of mutations) {
            fixCommentCounts(mutation.target);
        }
    });
    for (let elem of document.querySelectorAll(".end-index")) {
        // Changing textContent fires a childList event (removing and adding text nodes). It does not
        // fire a characterData event as you might expect.
        observer.observe(elem, { childList: true });
    }
}

let cssCode = `
.collapse-link {
  padding: 3px;
}
.collapse-link:not(:hover) {
  opacity: 0.7;
}
.comment .data {
  padding-right: 0.3rem;
}
.comment.forward-hidden {
  display: none;
}
.comment.collapsed .avatar {
  display: none;
}
.comment.collapsed .comment_callbacks {
  display: none;
}
.comment.collapsed .comment_data {
  display: none;
}
.comment.collapsed .comment_information:after {
  height: 0;
}
`;
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

    for (let index of document.querySelectorAll(".start-index, .end-index")) {
        fixCommentCounts(index);
    }

    setupCollapseLinks();
    setupHandlers();
    injectCSS();
    initializeElements(commentController);
}
