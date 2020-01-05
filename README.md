# Fimfiction Comment Tweaks

A collection of miscellaneous tweaks to Fimfiction comments.

## Install

Install a userscript manager like [Violentmonkey](https://violentmonkey.github.io/get-it/) or [Tampermonkey](https://www.tampermonkey.net/). (It may work with Greasemonkey or other userscript managers, but I haven't tested them.) Also ensure that you're using a reasonably modern browser (the script requires [ES6 support](https://caniuse.com/#feat=es6)).

Then, [click here](https://github.com/PluieElectrique/fimfic-comment-tweaks/raw/master/comment-tweaks.user.js) to install from GitHub. The userscript is also [available on Greasy Fork](https://greasyfork.org/en/scripts/384602-fimfiction-comment-tweaks).

## Features

* Comment collapsing: Collapse a comment and all of its "descendants"
    * "Oldest First" ordering: Collapses the comment, its replies, replies to those replies, and so on
    * "Newest First" ordering: Collapses the comment, comments it replied to, comment those comments replied to, and so on

![Comment collapse button in the header of a comment.](https://github.com/PluieElectrique/fimfic-comment-tweaks/raw/master/screenshots/comment-collapse-button.png)

![Animation of a comment and descendant collapsing.](https://github.com/PluieElectrique/fimfic-comment-tweaks/raw/master/screenshots/comment-collapsing.gif)

* Forward hiding: Clicking and expanding a link to a "forward" comment will hide the original comment
    * "Oldest First" ordering: Expanding a callback (in the header of a comment) hides the original comment
    * "Newest First" ordering: Expanding a quote link (in the body of a comment) hides the original comment

![Animation of forward hiding.](https://github.com/PluieElectrique/fimfic-comment-tweaks/raw/master/screenshots/forward-hiding.gif)

### Quote links

* Expanded callbacks are grouped below the comment header in order of expansion (Normally, replies are expanded after their callbacks, which pushes down unexpanded callbacks and makes them harder to click)
![Comparison of normal and tweaked comment expansion from callbacks.](https://github.com/PluieElectrique/fimfic-comment-tweaks/raw/master/screenshots/callback-grouping.png)
* When possible, cross-page quote links show the username and comment index instead of the comment ID
![Cross-page quote link showing the username and comment index.](https://github.com/PluieElectrique/fimfic-comment-tweaks/raw/master/screenshots/cross-page-quote-link.png)
* Hovering on an expanded link does not show its comment
* Quote links to the parent comment are disabled (helps prevent infinite/redundant expansion)
* Quote links broken across two lines cannot cause flickering (the hover comment is positioned from the bottom of the quote link)
* When possible, quote links to deleted comments are marked with a strikethrough

### Cosmetic

* When there are multiple quote links in a child comment, the link to the parent comment is underlined
![Underlined parent link in an expanded child comment with multiple quote links.](https://github.com/PluieElectrique/fimfic-comment-tweaks/raw/master/screenshots/parent-link-highlight.png)
* Comments shown on hover are the width of the comment list (instead of the width of their parent comment)
* 150ms quote link hover delay shortened to 85ms
* Increased comment width (by decreasing right padding) for deeper nesting
* Expanded quote links are grayed out

### Miscellaneous

* Comments do not expand with expanded child comments
* Embeds (image, YouTube, etc) work in expanded comments
* Loaded embeds will not autoplay when appearing in hover comments (should work for YouTube, Streamable, Gfycat, and Twitch, but probably not Soundcloud)
* Expanded comments show the username in the header
* When possible, cross-page comments show the comment index in the header instead of the comment ID (If not, the ID is shown without a "#" before it to differentiate it from an index)
* The previous/next page buttons update the URL hash (i.e. the visited page will be added to the browser history)

### Mobile

Most of these features don't apply to mobile, but the script does work on the mobile site. The differences/features are:

* Quote links will show usernames instead of numbers (and the index for cross-page links, etc.)
* Collapsing a comment collapses just that comment, and not any of its descendants
* Forward hiding only works with the "Newest First" ordering, as there are no callbacks
* Right padding is not decreased (it causes an overflow, and deeply nested comments can't fit on mobile screens anyway)
* Hover comments are disabled (they can accidentally be triggered, and don't look good)
* The commment count is updated when refreshing the comments or changing pages

## Thanks

Comment collapsing, forward hiding, callback grouping, and other features were inspired by [4chan X](https://www.4chan-x.net/).

## Legal

This userscript is under the MIT License. A copy can be found in the `LICENSE` file.

Some of the code has been directly cribbed (copy and pasted, variables renamed, prettified, de-Closure Compiled) from the Fimfiction source code. When possible, the script wraps existing code. When this is not possible, code must be copied.

The code in question is `Copyright (c) 2011-2019 knighty & Xaquseg`. It is not provided under an open-source license, thus, this is copyright infringement. Hopefully, though, the amount copied is small enough that they don't mind.
