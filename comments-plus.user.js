// ==UserScript==
// @name           Fimfiction Comments Plus
// @description    Enhanced comments for Fimfiction
// @author         Pluie
// @version        0.0.1
// @homepageURL    https://github.com/PluieElectrique/fimfic-comments-plus
// @downloadURL    https://github.com/PluieElectrique/fimfic-comments-plus/raw/master/comments-plus.user.js
// @updateURL      https://github.com/PluieElectrique/fimfic-comments-plus/raw/master/comments-plus.user.js
// @match          *://www.fimfiction.net/*
// @run-at         document-idle
// ==/UserScript==

let commentController;

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

    commentController = App.GetControllerFromElement(storyComments);
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
            // Don't show popup quote for expanded links, links within collapsed comments, or links
            // to the parent comment
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
            let link = comment.querySelector(`[href='#comment/${id}']`);
            if (meta !== undefined) {
                // Rewrite comment index
                link.textContent = formatCommentIndex(meta.index);
            } else {
                // Remove "#" to avoid confusing comment IDs with comment indexes
                link.textContent = link.textContent.slice(1);
            }
            this.rewriteQuoteLinks(comment);
            return comment;
        });
    },

    setupQuotes: function() {
        CommentListController.prototype.setupQuotes.call(this);
        this.storeComments();
        this.rewriteQuoteLinks(this.comment_list);
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
                removeElement(this.quote_container.firstChild);
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

        // Don't expand parent links or links within collapsed comments
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

                forwardHide(quoteLink, 1);
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
            // Update forward hiding counts for all expanded links
            for (let quoteLink of expandedComment.getElementsByClassName("cplus--expanded-link")) {
                forwardHide(quoteLink, -1);
            }
            removeElement(expandedComment);
            forwardHide(quoteLink, -1);
            quoteLink.classList.remove("cplus--expanded-link");
        }
    },

    /* Extra methods */

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
            if (meta !== undefined) {
                if (meta.index < indexRange[0] || indexRange[1] < meta.index) {
                    // Rewrite cross-page comments
                    quoteLink.textContent = `${meta.author} (${formatCommentIndex(meta.index)})`;
                } else if (is_mobile) {
                    // On mobile, the prototype setupQuotes does nothing. So we have to rewrite all
                    // quote links
                    quoteLink.textContent = meta.author;
                }
            }
        }
    }
};

function getCommentIndexRange() {
    // We could extract the index from the .start-index, .end-index, and .num-comments elements.
    // But, because of how goToPage works (it doesn't share the index data with the promise
    // callback, and any callback we did pass would run before it updated the index elements), it's
    // easier to do this.
    let extractIndex = comment =>
        Number(
            comment
                .querySelector(`a[href='#comment/${comment.dataset.comment_id}']`)
                .textContent.slice(1)
                .replace(/,/g, "")
        );

    let firstIndex = extractIndex(commentController.comment_list.firstElementChild);
    let lastIndex = extractIndex(commentController.comment_list.lastElementChild);

    // The order depends on the comment sorting
    return [Math.min(firstIndex, lastIndex), Math.max(firstIndex, lastIndex)];
}

function forwardHide(quoteLink, change) {
    // Callbacks expand newer comments into older ones. So, in ASC order (oldest to newest), we
    // forward hide when expanding callbacks. Non-callbacks expand older comments. So, in DESC order
    // (newest to oldest), we forward hide when expanding non-callbacks.
    let isCallback = quoteLink.classList.contains("comment_callback");
    let isASC = commentController.order === "ASC";
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

    // We always collapse comments which appear later in the comment list. Exactly which quote links
    // we search through depends on the sorting order.
    let quoteLinks =
        commentController.order === "ASC"
            ? comment.querySelectorAll(".comment_callback")
            : comment.querySelectorAll(".comment_quote_link:not(.comment_callback)");

    for (let quoteLink of quoteLinks) {
        // In DESC sorting, we need to ignore links to comments on other pages. This also means
        // avoiding comments which have been stored in quote_container and hidden_comments.
        let nextComment = commentController.comment_list.querySelector(
            "#comment_" + quoteLink.dataset.comment_id
        );
        if (nextComment === null) {
            continue;
        }

        collapseCommentTree(nextComment, collapse);
    }
}

// Clone a comment and reset it
function cloneComment(comment) {
    // Remove quotes to avoid cloning them
    let commentCallbacks = comment.querySelector(".comment_callbacks");
    let callbackQuotes = commentCallbacks.querySelectorAll(".inline-quote");
    for (let quote of callbackQuotes) {
        removeElement(quote);
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
    // Get rid of the blue highlight caused by clicking on the comment's index or posting date
    clone.classList.remove("comment_selected");

    // Remove cplus classes (we don't need to remove parent-link-highlight because it's only applied
    // to links in expanded comments)
    clone.classList.remove("cplus--forward-hidden");
    clone.classList.remove("cplus--collapsed-comment");
    for (let expandedLink of clone.getElementsByClassName("cplus--expanded-link")) {
        expandedLink.classList.remove("cplus--expanded-link");
    }

    // Remove middot and collapse button
    let collapseButton = clone.querySelector(".cplus--collapse-button");
    if (collapseButton !== null) {
        removeElement(collapseButton.nextElementSibling);
        removeElement(collapseButton);
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

// https://stackoverflow.com/a/2901298
function formatCommentIndex(index) {
    return ("#" + index).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function createMiddot() {
    let middot = document.createElement("b");
    middot.textContent = "\u00b7";
    return middot;
}

function removeElement(elem) {
    elem.parentNode.removeChild(elem);
}
