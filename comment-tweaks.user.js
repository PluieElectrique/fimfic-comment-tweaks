// ==UserScript==
// @name           Fimfiction Comment Tweaks
// @description    Tweaks for Fimfiction comments
// @author         Pluie
// @version        0.0.1
// @homepageURL    https://github.com/PluieElectrique/fimfic-comment-tweaks
// @downloadURL    https://github.com/PluieElectrique/fimfic-comment-tweaks/raw/master/comment-tweaks.user.js
// @updateURL      https://github.com/PluieElectrique/fimfic-comment-tweaks/raw/master/comment-tweaks.user.js
// @match          *://www.fimfiction.net/*
// @run-at         document-idle
// ==/UserScript==

var commentController;
var comment_list;

// Despite the @run-at option, the userscript is sometimes run before the Fimfiction JS, which
// causes errors. So, we wait for the page to be fully loaded.
if (document.readyState == "complete") {
    init();
} else {
    window.addEventListener("load", init);
}

var ctCSS = `
.ct--collapse-button { padding: 3px; }
.ct--collapsed-comment .author > .avatar { display: none; }
.ct--collapsed-comment .comment_callbacks > a { opacity: 0.7; }
.ct--collapsed-comment .comment_callbacks > div { display: none; }
.ct--collapsed-comment .comment_data { display: none; }
.ct--collapsed-comment .comment_information:after { height: 0; }
.ct--expanded-link { opacity: 0.7; }
.ct--forward-hidden { display: none; }
.ct--parent-link-highlight { text-decoration: underline; }
@media all and (min-width: 701px) { .inline-quote .meta > .name { display: inline; } }
`;

// Note about mobile: To be consistent with Fimfiction, this script detects mobile by using
// `is_mobile`, a global declared in an inline script in <head>. It seems detection of mobile
// browsers is done server side (probably through user agent).

function init() {
    let storyComments = document.getElementById("story_comments");
    if (storyComments === null) {
        return;
    }

    let style = document.createElement("style");
    style.textContent = ctCSS;
    document.head.appendChild(style);

    commentController = App.GetControllerFromElement(storyComments);
    comment_list = commentController.comment_list;
    Object.assign(commentController, commentControllerShell);

    if (is_mobile) {
        commentController.storeComments();
        commentController.rewriteQuoteLinks(comment_list);
    }
    setupCollapseButtons();

    setupEventListeners();

    // quote_container is used by beginShowQuote to store the hovered quote (when there is one). In
    // the original code, it's checked for on each call. Here, we create it at init.
    if (commentController.quote_container === null) {
        let container = document.createElement("div");
        container.className = "quote_container";
        document.body.appendChild(container);
        commentController.quote_container = container;
    }
}

function setupEventListeners() {
    fQuery.addScopedEventListener(comment_list, ".ct--collapse-button", "click", evt =>
        toggleCollapseCommentTree(fQuery.closestParent(evt.target, ".comment"))
    );

    let cancelCallback = null;
    fQuery.addScopedEventListener(comment_list, ".comment_quote_link", "mouseover", evt => {
        evt.stopPropagation();
        // Mouseover events can sometimes be triggered on mobile, but there's no point. They
        // just block the page.
        if (is_mobile) {
            return;
        }
        // Don't show popup quote for expanded links, links within collapsed comments, or links
        // to the parent comment
        let linkStatus = getQuoteLinkStatus(evt.target);
        if (!linkStatus.isExpanded && !linkStatus.parentCollapsed && !linkStatus.isParentLink) {
            commentController.hoverTimeout = setTimeout(_ => {
                cancelCallback = commentController.beginShowQuote(evt.target);
            }, 85);
        }
    });
    fQuery.addScopedEventListener(comment_list, ".comment_quote_link", "mouseout", _ => {
        if (cancelCallback !== null) {
            cancelCallback();
            cancelCallback = null;
        }
    });

    // These event listeners are added as "global binders." That is, they are added to each element
    // that matches their selector. Because this binding is only done at load (and in a few other
    // cases), and because cloneNode does not copy event listeners, embeds will not work in expanded
    // comments. Listeners scoped to the comment list let all embeds work.
    let containerClasses = ["user_image_link", "youtube_container", "embed-container"];
    App.globalBinders
        .filter(binder => containerClasses.includes(binder.class))
        .forEach(binder => {
            fQuery.addScopedEventListener(
                comment_list,
                binder.selector,
                binder.event,
                binder.binder
            );
        });
}

// A wrapper object that will be assigned onto the real comment controller
var commentControllerShell = {
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

        let cancel = false;
        this.getComment(quoteLink.dataset.comment_id).then(comment => {
            if (cancel) {
                return;
            }

            this.quote_container.classList.remove("hidden");
            if (this.quote_container.firstChild !== null) {
                removeElement(this.quote_container.firstChild);
            }

            let parent = fQuery.closestParent(quoteLink, ".comment");

            let clone = cloneComment(comment);
            markParentLink(parent, clone);
            this.quote_container.appendChild(clone);

            let parentRect = this.comment_list.getBoundingClientRect();
            let style = this.quote_container.style;
            style.top = quoteLink.getBoundingClientRect().top + fQuery.scrollTop() + 23 + "px";
            style.left = parentRect.left - 6 + "px";
            style.width = parentRect.width + 12 + "px";

            App.DispatchEvent(this.quote_container, "loadVisibleImages");
        });

        return _ => {
            cancel = true;
        };
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
                quoteLink.classList.add("ct--expanded-link");

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
            for (let quoteLink of expandedComment.getElementsByClassName("ct--expanded-link")) {
                forwardHide(quoteLink, -1);
            }
            removeElement(expandedComment);
            forwardHide(quoteLink, -1);
            quoteLink.classList.remove("ct--expanded-link");
        }
    },

    /* Extra methods */

    storeComments: function() {
        for (let comment of this.comment_list.children) {
            // Is this a deleted comment?
            if (
                comment.firstElementChild.classList.contains("message") &&
                comment.lastElementChild.classList.contains("hidden")
            ) {
                continue;
            }

            let link = comment.querySelector("a[href^='#comment/']");
            this.commentMetadata[comment.dataset.comment_id] = {
                author: comment.dataset.author,
                index: Number(link.textContent.slice(1).replace(/,/g, ""))
            };
        }
    },

    rewriteQuoteLinks: function(elem) {
        for (let quoteLink of elem.querySelectorAll(".comment_quote_link:not(.comment_callback)")) {
            let id = quoteLink.dataset.comment_id;
            let meta = this.commentMetadata[id];
            if (meta !== undefined) {
                if (this.comment_list.querySelector("#comment_" + id) === null) {
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

function forwardHide(quoteLink, change) {
    // Callbacks expand newer comments into older ones. So, in ASC order (oldest to newest), we
    // forward hide when expanding callbacks. Non-callbacks expand older comments. So, in DESC order
    // (newest to oldest), we forward hide when expanding non-callbacks.
    let isCallback = quoteLink.classList.contains("comment_callback");
    let isASC = commentController.order === "ASC";
    if (isCallback !== isASC) {
        return;
    }

    let comment = comment_list.querySelector("#comment_" + quoteLink.dataset.comment_id);
    let newCount = Number(comment.dataset.expandCount || 0) + change;
    if (newCount < 0) {
        throw new Error("Expand count cannot be less than 0");
    } else if (newCount === 0) {
        comment.classList.remove("ct--forward-hidden");
    } else if (newCount === 1) {
        comment.classList.add("ct--forward-hidden");
    }
    comment.dataset.expandCount = newCount;
}

function setupCollapseButtons() {
    for (let metaName of comment_list.querySelectorAll(".meta > .name")) {
        fQuery.insertAfter(metaName, createMiddot());

        let collapseButton = document.createElement("a");
        collapseButton.classList.add("ct--collapse-button");
        let minus = document.createElement("i");
        minus.classList.add("fa", "fa-minus-square-o");
        collapseButton.appendChild(minus);
        fQuery.insertAfter(metaName, collapseButton);
    }
}

function toggleCollapseCommentTree(comment) {
    collapseCommentTree(comment, !comment.classList.contains("ct--collapsed-comment"));
}
function collapseCommentTree(comment, collapse) {
    comment.classList.toggle("ct--collapsed-comment", collapse);

    let collapseIcon = comment.querySelector(".ct--collapse-button > i");
    collapseIcon.classList.toggle("fa-plus-square-o", collapse);
    collapseIcon.classList.toggle("fa-minus-square-o", !collapse);

    // We always collapse comments which appear later in the comment list. Exactly which quote links
    // we search through depends on the sorting order.
    let comment_id = comment.dataset.comment_id;
    if (commentController.order === "ASC") {
        // We are careful to not select any quote links in expanded comments
        let quoteLinks = comment.querySelectorAll(`#comment_callbacks_${comment_id} > a`);
        for (let quoteLink of quoteLinks) {
            let nextComment = comment_list.querySelector(
                "#comment_" + quoteLink.dataset.comment_id
            );
            collapseCommentTree(nextComment, collapse);
        }
    } else {
        // There's no easy way to select the quote links in the .data of this comment and ignore
        // links in expanded comments. It would require some kind of :not(descendant of inline
        // quote) selector, which is not possible. Instead, we select backlinks which point to the
        // current comment, and then get the comments which have those backlinks.
        // This seems pretty inefficient, but it only uses DOM lookups, and doesn't require
        // extracting and storing data from the DOM, which I feel might increase complexity.
        let quoteLinks = comment_list.querySelectorAll(
            `[id^='comment_callbacks_'] > a[data-comment_id='${comment_id}']`
        );
        for (let quoteLink of quoteLinks) {
            collapseCommentTree(fQuery.closestParent(quoteLink, ".comment"), collapse);
        }
    }
}

// Clone a comment and reset it
function cloneComment(comment) {
    let clone = comment.cloneNode(true);

    clone.removeAttribute("id");
    // Needed for comment collapsing
    clone.querySelector(".comment_callbacks").removeAttribute("id");
    // Get rid of the blue highlight caused by clicking on the comment's index or posting date
    clone.classList.remove("comment_selected");

    // Remove ct classes (we don't need to remove parent-link-highlight because it's only applied
    // to links in expanded comments)
    clone.classList.remove("ct--forward-hidden");
    clone.classList.remove("ct--collapsed-comment");
    for (let expandedLink of clone.getElementsByClassName("ct--expanded-link")) {
        expandedLink.classList.remove("ct--expanded-link");
    }

    // Remove middot and collapse button
    let collapseButton = clone.querySelector(".ct--collapse-button");
    if (collapseButton !== null) {
        removeElement(collapseButton.nextElementSibling);
        removeElement(collapseButton);
    }

    // Remove quotes
    for (let inlineQuote of clone.getElementsByClassName("inline-quote")) {
        removeElement(inlineQuote);
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
            linkToParent.classList.add("ct--parent-link-highlight");
        }
        // This prevents the link from being expanded
        linkToParent.dataset.parentLink = true;
    }
}

function getQuoteLinkStatus(quoteLink) {
    return {
        isExpanded: quoteLink.classList.contains("ct--expanded-link"),
        isParentLink: quoteLink.dataset.parentLink,
        parentCollapsed: fQuery
            .closestParent(quoteLink, ".comment")
            .classList.contains("ct--collapsed-comment")
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
