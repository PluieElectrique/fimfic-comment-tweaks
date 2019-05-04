// ==UserScript==
// @name           Fimfiction Comments Plus
// @description    Enhanced comments for Fimfiction
// @author         Pluie
// @version        0.0.1
// @homepageURL    https://github.com/PluieElectrique/fimfic-comments-plus
// @downloadURL    https://github.com/PluieElectrique/fimfic-comments-plus/raw/master/commentsplus.user.js
// @updateURL      https://github.com/PluieElectrique/fimfic-comments-plus/raw/master/commentsplus.user.js
// @match          *://www.fimfiction.net/*
// @run-at         document-idle
// ==/UserScript==

// Despite the @run-at option, Firefox sometimes runs the userscript before the Fimfiction JS, which
// causes errors. So, we wait for the page to be fully loaded.
if (document.readyState == "complete") {
    init();
} else {
    window.addEventListener("load", init);
}

let cplusCSS = `
.cplus--collapse-button { padding: 3px; }
.cplus--collapse-button:not(:hover) { opacity: 0.7; }
.cplus--collapsed-comment .author > .avatar { display: none; }
.cplus--collapsed-comment .comment_callbacks > a { opacity: 0.7; }
.cplus--collapsed-comment .comment_callbacks > div { display: none; }
.cplus--collapsed-comment .comment_data { display: none; }
.cplus--collapsed-comment .comment_information:after { height: 0; }
.cplus--expanded-link { opacity: 0.7; }
.cplus--forward-hidden { display: none; }
.cplus--parent-link-highlight { text-decoration: underline; }
@media all and (min-width: 701px) { .inline-quote .meta > .name { display: inline; } }
`;

function init() {
    let storyComments = document.getElementById("story_comments");
    if (storyComments === null) {
        return;
    }

    let style = document.createElement("style");
    style.textContent = cplusCSS;
    document.head.appendChild(style);

    let commentController = App.GetControllerFromElement(storyComments);
    Object.assign(commentController, commentControllerShell);

    setupCollapseButtons();

    fQuery.addScopedEventListener(
        commentController.comment_list,
        ".cplus--collapse-button",
        "click",
        evt => toggleCollapseCommentTree(fQuery.closestParent(evt.target, ".comment"))
    );

    fQuery.addScopedEventListener(
        commentController.comment_list,
        ".comment_quote_link",
        "mouseover",
        evt => {
            // Remove 150ms delay by preventing the normal event listener from firing
            evt.stopPropagation();
            // Don't show popup quote for expanded links, links of collapsed comments, or links to
            // the parent comment
            let linkStatus = getQuoteLinkStatus(evt.target);
            if (!linkStatus.isExpanded && !linkStatus.parentCollapsed && !linkStatus.isParentLink) {
                commentController.beginShowQuote(evt.target);
            }
        }
    );

    // quote_container is used by beginShowQuote to store the hovered quote (when there is one). In
    // the original code, it's checked for on each call. Here, we create it at init.
    if (commentController.quote_container === null) {
        let container = document.createElement("div");
        container.className = "quote_container";
        document.body.appendChild(container);
        commentController.quote_container = container;
    }
}

// A wrapper object that will be assigned onto the real comment controller
let commentControllerShell = {
    // Map from comment number (`data-comment_id`) to { author, index }
    commentMetadata: {},

    /* Methods that shadow existing methods */

    getComment: function(id) {
        let comment = document.getElementById("comment_" + id);
        if (comment !== null) {
            return new Promise(f => f(comment));
        }

        return CommentListController.prototype.getComment.call(this, id).then(comment => {
            let meta = this.commentMetadata[id];
            if (meta !== undefined) {
                // Rewrite comment index
                comment.querySelector(`[href='#comment/${id}']`).textContent = "#" + meta.index;
            }
            this.rewriteQuoteLinks(comment);
            return comment;
        });
    },

    setupQuotes: function() {
        CommentListController.prototype.setupQuotes.call(this);
        this.rewriteQuoteLinks(this.comment_list);
        this.storeComments();
        setupCollapseButtons();
    },

    goToPage: function(num) {
        this.storeComments();
        CommentListController.prototype.goToPage.call(this, num);
    },

    beginShowQuote: function(quoteLink) {
        // Just in case a mouseover event is triggered before the last mouseover's mouseout has
        this.endShowQuote();

        this.getComment(quoteLink.dataset.comment_id).then(comment => {
            this.quote_container.classList.remove("hidden");
            if (this.quote_container.firstChild !== null) {
                fQuery.removeElement(this.quote_container.firstChild);
            }

            let parent = fQuery.closestParent(quoteLink, ".comment");

            let clone = cloneComment(comment);
            markParentLink(parent, clone);
            this.quote_container.appendChild(clone);

            let parentRect = parent.getBoundingClientRect();
            let style = this.quote_container.style;
            style.top = quoteLink.getBoundingClientRect().top + fQuery.scrollTop() + 23 + "px";
            style.left = parentRect.left - 20 + "px";
            style.width = parentRect.width + 40 + "px";

            App.DispatchEvent(this.quote_container, "loadVisibleImages");
        });
    },

    expandQuote: function(quoteLink) {
        let parent = fQuery.closestParent(quoteLink, ".comment");

        // Don't expand parent links or links of collapsed comments
        let linkStatus = getQuoteLinkStatus(quoteLink);
        if (linkStatus.parentCollapsed || linkStatus.isParentLink) {
            return;
        }

        this.endShowQuote();

        let linkedId = quoteLink.dataset.comment_id;
        let expandedComment = quoteLink.parentNode.querySelector(
            `.comment[data-comment_id='${linkedId}']`
        );
        if (expandedComment === null) {
            this.getComment(linkedId).then(comment => {
                let clone = cloneComment(comment);
                markParentLink(parent, clone);
                clone.classList.add("inline-quote");

                this.forwardHide(quoteLink, 1);
                quoteLink.classList.add("cplus--expanded-link");

                // is_mobile is a global declared in an inline script in <head>. It seems detection
                // of mobile browsers is done server side (probably through user agent).
                if (!is_mobile) {
                    // Add middot after username in .meta to separate it from the index. On mobile,
                    // the username is `display: block;`, so we don't need a separator.
                    fQuery.insertAfter(clone.querySelector(".meta > .name"), createMiddot());
                }

                if (quoteLink.classList.contains("comment_callback")) {
                    // Search backwards through .comment_callbacks for the last quote link, and
                    // place this comment after it. This keeps quote links together at the top and
                    // orders expanded comments from most to least recently expanded.
                    let lastLink = quoteLink.parentElement.lastElementChild;
                    while (lastLink.tagName !== "A") {
                        lastLink = lastLink.previousElementSibling;
                    }
                    fQuery.insertAfter(lastLink, clone);
                } else {
                    fQuery.insertAfter(quoteLink, clone);
                }
            });
        } else {
            // The comment is already expanded, so remove it
            fQuery.removeElement(expandedComment);
            quoteLink.classList.remove("cplus--expanded-link");
            this.forwardHide(quoteLink, -1);
        }
    },

    /* Extra methods for ease of accessing `this` */

    storeComments: function() {
        let indexRange = getCommentIndexRange();

        // It's easier to number the comments off from an index than it is to extract the index from
        // the <a> (as that <a> has no ID to easily get it by).
        let ordering, startIndex;
        if (this.order === "ASC") {
            ordering = 1;
            startIndex = indexRange[0];
        } else {
            ordering = -1;
            startIndex = indexRange[1];
        }

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
        let indexRange = getCommentIndexRange();
        for (let quoteLink of elem.querySelectorAll(".comment_quote_link:not(.comment_callback)")) {
            let meta = this.commentMetadata[quoteLink.dataset.comment_id];
            if (meta !== undefined && (meta.index < indexRange[0] || indexRange[1] < meta.index)) {
                quoteLink.textContent = `${meta.author} (#${meta.index})`;
            }
        }
    },

    forwardHide: function(quoteLink, change) {
        if (change !== 1 && change !== -1) {
            throw new Error("Change to expand count must be 1 or -1");
        }

        // Callbacks expand newer comments into older ones. So, in ASC order (oldest to newest), we
        // forward hide when expanding callbacks. Non-callbacks expand older comments. So, in DESC
        // order (newest to oldest), we forward hide when expanding non-callbacks.
        let isCallback = quoteLink.classList.contains("comment_callback");
        let isASC = this.order === "ASC";
        if (isCallback !== isASC) {
            return;
        }

        let comment = document.getElementById("comment_" + quoteLink.dataset.comment_id);
        let newCount = Number(comment.dataset.expandCount || 0) + change;
        if (newCount < 0) {
            throw new Error("Expand count cannot be less than 0");
        } else if (newCount === 0) {
            comment.classList.remove("cplus--forward-hidden");
        } else if (newCount === 1) {
            comment.classList.add("cplus--forward-hidden");
        }
        comment.dataset.expandCount = newCount;
    }
};

function setupCollapseButtons() {
    for (let metaName of document.querySelectorAll(".meta > .name")) {
        fQuery.insertAfter(metaName, createMiddot());

        let collapseButton = document.createElement("a");
        collapseButton.classList.add("cplus--collapse-button");
        let minus = document.createElement("i");
        minus.classList.add("fa", "fa-minus-square-o");
        collapseButton.appendChild(minus);
        fQuery.insertAfter(metaName, collapseButton);
    }
}

function toggleCollapseCommentTree(comment) {
    collapseCommentTree(comment, !comment.classList.contains("cplus--collapsed-comment"));
}
function collapseCommentTree(comment, collapse) {
    comment.classList.toggle("cplus--collapsed-comment", collapse);

    let collapseIcon = comment.querySelector(".cplus--collapse-button > i");
    collapseIcon.classList.toggle("fa-plus-square-o", collapse);
    collapseIcon.classList.toggle("fa-minus-square-o", !collapse);

    for (let callback of comment.querySelectorAll(".comment_callback")) {
        let id = "comment_" + callback.dataset.comment_id;
        collapseCommentTree(document.getElementById(id), collapse);
    }
}

// Clone a comment unhidden and without expanded links and collapse button/middot
function cloneComment(comment) {
    // Remove quotes to avoid cloning them
    let commentCallbacks = comment.querySelector(".comment_callbacks");
    let callbackQuotes = commentCallbacks.querySelectorAll(".inline-quote");
    for (let quote of callbackQuotes) {
        fQuery.removeElement(quote);
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
    clone.classList.remove("cplus--collapsed-comment");

    // Remove middot and collapse button
    let collapseButton = clone.querySelector(".cplus--collapse-button");
    if (collapseButton !== null) {
        fQuery.removeElement(collapseButton.nextElementSibling);
        fQuery.removeElement(collapseButton);
    }

    // Restore quotes
    for (let quote of callbackQuotes) {
        commentCallbacks.appendChild(quote);
    }

    for (let quote of dataQuotes) {
        fQuery.insertAfter(quote.link, quote.quote);
    }

    return clone;
}

// Disable links to the parent comment to prevent infinite nesting. Also highlight the link if there
// are other links in its section.
function markParentLink(parentComment, childComment) {
    let parentId = parentComment.dataset.comment_id;
    let linkToParent = childComment.querySelector(
        `.comment_quote_link[data-comment_id='${parentId}']`
    );
    if (linkToParent !== null) {
        // If there are other links in this quote link's section (comment data or callbacks), mark
        // this link for visibility
        let otherLink = fQuery
            .closestParent(linkToParent, ".comment_data, .comment_callbacks")
            .querySelector(`.comment_quote_link:not([data-comment_id='${parentId}'])`);
        if (otherLink !== null) {
            linkToParent.classList.add("cplus--parent-link-highlight");
        }
        // This prevents the link from being expanded
        linkToParent.dataset.parentLink = true;
    }
}

function getQuoteLinkStatus(quoteLink) {
    return {
        isExpanded: quoteLink.classList.contains("cplus--expanded-link"),
        isParentLink: quoteLink.dataset.parentLink,
        parentCollapsed: fQuery
            .closestParent(quoteLink, ".comment")
            .classList.contains("cplus--collapsed-comment")
    };
}

// Return the range of comment indexes for the current page
function getCommentIndexRange() {
    let indexToNumber = indexClass =>
        Number(document.querySelector(indexClass).textContent.replace(/,/g, ""));

    // There are two cases in which an index can be greater than .num-comments:
    //   * If a story has 0 comments, .start-index will incorrectly be 1.
    //   * In ASC order, .end-index is rounded up to the nearest multiple of 50. If the number of
    //     comments is not a multiple of 50, .end-index will be wrong on the last page.
    //     Issue: https://github.com/knighty/fimfiction-issues/issues/124
    let numComments = indexToNumber(".num-comments");
    let startIndex = Math.min(indexToNumber(".start-index"), numComments);
    let endIndex = Math.min(indexToNumber(".end-index"), numComments);

    return [startIndex, endIndex];
}

function createMiddot() {
    let middot = document.createElement("b");
    middot.textContent = "\u00b7";
    return middot;
}
