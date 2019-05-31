# Fimfiction Comment Tweaks

## Install

Install [Violentmonkey](https://violentmonkey.github.io/get-it/) for your browser. It should also work in [Tampermonkey](https://www.tampermonkey.net/). Greasemonkey is not supported (but may still work, I don't know or test it).

Then, [click here](https://github.com/PluieElectrique/fimfic-comment-tweaks/raw/master/comment-tweaks.user.js) to install the userscript.

## Features

* Comment collapsing: Collapse a comment and all of its "descendants"
    * "Oldest First" ordering: Collapses the comment, its replies, replies to those replies, and so on
    * "Newest First" ordering: Collapses the comment, comments that it replied to, comment that those comments replied to, and so on

* Forward hiding: Clicking and expanding a link to a "forward" comment will hide the original comment
    * "Oldest First" ordering: Expanding a backlink (in the header of a comment) will hide the original comment
    * "Newest First" ordering: Expanding a quote link (in the body of a comment) will hide the original comment

### Miscellaneous

* Expanded comments show the username in the header
* When possible, cross-page quote links show the username and comment index instead of the comment ID
* When possible, cross-page comments show the comment index in the header instead of the comment ID (If not, the comment ID will be shown without a "#" before it to differentiate it from an index)
* When possible, quote links to deleted comments are marked with "(deleted)".
* Comments expanded from callbacks are grouped together below the comment header (Normally, expanded comments are inserted after their callbacks, which can push down unexpanded callbacks)
* Quote links to the parent comment are disabled (somewhat prevents infinite expanding)
* Hovering on an expanded link does not show its comment
* Expanded comments do not expand with their own expanded comments
* Embeds (image, YouTube, etc) work correctly in expanded comments
* The previous/next page buttons update the URL hash
* Quote links broken across two lines cannot cause flickering (the hover comment is positioned from the bottom of the quote link)

### Cosmetic

* Expanded quote links are grayed out
* When there are multiple quote links in an child comment, the link to the parent comment is underlined
* Reduced 150ms delay to show comment when hovering over quote link to 85ms
* Comments shown on hover are the full width of the comment list (as opposed to the width of their parent comment)
* Increased comment width (by decreasing right padding) for deeper nesting

### Mobile

On mobile, the main difference is that there are no backlinks (as is normal).

* Disabled showing comments on hover (`mouseover` events can sometimes be triggered)

## Thanks

The comment collapsing and forward hiding behavior is based off of [4chan X](https://www.4chan-x.net/).

## Legal

This userscript is under the MIT License. A copy can be found in the `LICENSE` file.

Some of the code has been directly cribbed (copy and pasted, variables renamed, prettified, de-Closure Compiled) from the Fimfiction source code. When possible, the script wraps existing code. When this is not possible, large feature must be added on top of an existing one), code must be copied.

The code in question is `Copyright (c) 2011-2019 knighty & Xaquseg`. It is not provided under an open-source license, thus, this is copyright infringement. Hopefully, though, the amount copied is small enough that they don't mind.
