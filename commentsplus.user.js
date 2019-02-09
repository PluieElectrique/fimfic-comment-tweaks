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

// Clone a comment without expanded links, unhidden, no collapse button
function cloneComment(comment) {
    // Remove quotes to avoid cloning them
    let commentCallbacks = comment.querySelector(".comment_callbacks");
    let callbackQuotes = commentCallbacks.querySelectorAll(".inline-quote");
    for (let quote of callbackQuotes) {
        commentCallbacks.removeChild(quote);
    }

    let commentData = comment.querySelector(".comment_data");
    let dataQuotes = [];
    for (let quote of commentData.querySelectorAll(".inline-quote")) {
        // Get the link first. If we remove the quote first, then the sibling will be null.
        dataQuotes.push({
            link: quote.previousElementSibling,
            quote: quote.parentNode.removeChild(quote)
        });
    }

    let clone = comment.cloneNode(true);
    clone.removeAttribute("id");
    clone.classList.remove("cplus--forward-hidden");
    clone.classList.remove("cplus--collapsed");
    // Remove collapse button and mid-dot
    let meta = clone.querySelector(".meta");
    meta.removeChild(meta.firstChild);
    meta.removeChild(meta.firstChild);

    // Restore quotes
    for (let quote of callbackQuotes) {
        commentCallbacks.appendChild(quote);
    }

    for (let quote of dataQuotes) {
        fQuery.insertAfter(quote.link, quote.quote);
    }

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
        comment.classList.remove("cplus--forward-hidden");
    } else if (newCount === 1) {
        comment.classList.add("cplus--forward-hidden");
    }

    dataset.expandCount = newCount;
}

function setupCollapseButtons() {
    for (let meta of document.querySelectorAll(".meta")) {
        let middot = document.createElement("b");
        middot.textContent = "\u00b7";
        fQuery.prepend(meta, middot);

        let collapseButton = document.createElement("a");
        collapseButton.classList.add("cplus--collapse-button");
        let minus = document.createElement("i");
        minus.classList.add("fa", "fa-minus-square-o");
        collapseButton.appendChild(minus);
        fQuery.prepend(meta, collapseButton);
    }
}

function toggleCollapseCommentTree(comment) {
    collapseCommentTree(comment, !comment.classList.contains("cplus--collapsed"));
}
function collapseCommentTree(comment, collapse) {
    comment.classList.toggle("cplus--collapsed", collapse);

    let collapseIcon = comment.querySelector(".cplus--collapse-button > i");
    collapseIcon.classList.toggle("fa-plus-square-o", collapse);
    collapseIcon.classList.toggle("fa-minus-square-o", !collapse);

    for (let callback of comment.querySelectorAll(".comment_callback")) {
        let id = "comment_" + callback.dataset.comment_id;
        collapseCommentTree(document.getElementById(id), collapse);
    }
}

// Stop propagation of mouse events on comment links
function stopPropagation(evt) {
    evt.stopPropagation();
}

// An object that will be assigned onto the real comment controller
let commentControllerShell = {
    // Map from comment number (`data-comment_id`) to { author, index }
    commentMetadata: {},

    // Methods that shadow existing methods
    getComment: smuggle(function(id) {
        let comment = document.getElementById("comment_" + id);
        if (comment !== null) {
            return new Promise(f => f(comment));
        }

        return this.prototype.getComment.call(this, id).then(
            smuggle(comment => {
                let meta = this.commentMetadata[id];
                if (meta !== undefined) {
                    // Rewrite comment index
                    comment.querySelector(`[href='#comment/${id}']`).textContent = "#" + meta.index;
                }
                this.rewriteQuoteLinks(comment);
                return comment;
            })
        );
    }),

    setupQuotes: smuggle(function() {
        this.prototype.setupQuotes.call(this);
        this.rewriteQuoteLinks(this.comment_list);
        this.storeComments();
        setupCollapseButtons();
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

            // Search backwards through .comment_callbacks for the last quote link, and place this
            // comment after it. This keeps quote links together at the top and orders expanded
            // comments from most to least recently expanded.
            let lastLink = quoteLink.parentElement.lastElementChild;
            while (lastLink.tagName !== "A") {
                lastLink = lastLink.previousElementSibling;
            }
            fQuery.insertAfter(lastLink, comment);
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
        let indexToNumber = indexClass =>
            Number(document.querySelector(indexClass).textContent.replace(/,/g, ""));

        // It's easier to number the comments off from an index than it is to extract the index from
        // the <a> (as that <a> has no ID to easily get it by).
        let ordering, startIndex;
        if (this.order === "ASC") {
            ordering = 1;
            startIndex = indexToNumber(".start-index");
        } else {
            ordering = -1;
            startIndex = indexToNumber(".end-index");
        }

        // There are two cases in which an index can be greater than .num-comments:
        //   * If a story has 0 comments, .start-index will incorrectly be 1.
        //   * In ASC order, .end-index is rounded up to the nearest multiple of 50. If the number
        //     of comments is not a multiple of 50, .end-index will be wrong on the last page.
        //     Issue: https://github.com/knighty/fimfiction-issues/issues/124
        startIndex = Math.min(startIndex, indexToNumber(".num-comments"));

        Array.from(this.comment_list.children).forEach((comment, i) => {
            // Is this a deleted comment?
            if (
                comment.firstElementChild.classList.contains("message") &&
                comment.lastElementChild.classList.contains("hidden")
            ) {
                return;
            }

            this.commentMetadata[comment.dataset.comment_id] = {
                author: comment.dataset.author,
                index: startIndex + ordering * i
            };
        });
    },

    rewriteQuoteLinks: function(elem) {
        for (let quoteLink of elem.querySelectorAll(".comment_quote_link:not(.comment_callback)")) {
            let meta = this.commentMetadata[quoteLink.dataset.comment_id];
            if (meta !== undefined) {
                quoteLink.textContent = meta.author;
            }
        }
    },

    // For ease of calling methods on the prototype
    prototype: CommentListController.prototype
};

let cssCode = `
.cplus--collapse-button { padding: 3px; }
.cplus--collapse-button:not(:hover) { opacity: 0.7; }
.comment .data { padding-right: 0.3rem; }
.comment.cplus--forward-hidden { display: none; }
.comment.cplus--collapsed .avatar { display: none; }
.comment.cplus--collapsed .comment_callbacks { display: none; }
.comment.cplus--collapsed .comment_data { display: none; }
.comment.cplus--collapsed .comment_information:after { height: 0; }
`;

let storyComments = document.getElementById("story_comments");
if (storyComments !== null) {
    let commentController = App.GetControllerFromElement(storyComments);
    Object.assign(commentController, commentControllerShell);

    setupCollapseButtons();

    fQuery.addScopedEventListener(
        commentController.comment_list,
        ".cplus--collapse-button",
        "click",
        evt => toggleCollapseCommentTree(fQuery.closestParent(evt.target, ".comment"))
    );

    let style = document.createElement("style");
    style.type = "text/css";
    style.textContent = cssCode;
    document.head.appendChild(style);

    // quote_container is used by beginShowQuote to store the hovered quote (when there is one). In
    // the original code, it's checked for on each call. Here, we create it at initialization.
    if (commentController.quote_container === null) {
        let container = document.createElement("div");
        container.className = "quote_container";
        document.body.appendChild(container);
        commentController.quote_container = container;
    }
}
