# Fimfiction Comments Plus

Userscript for enhanced Fimfiction comments. Inspired by [4chan X](https://www.4chan-x.net/).

## Install

Install [Violentmonkey](https://violentmonkey.github.io/get-it/) for your browser. It should also work in [Tampermonkey](https://www.tampermonkey.net/). Greasemonkey is not supported (but may still work, I don't know or test it).

Then, [click here](https://github.com/PluieElectrique/fimfic-comments-plus/raw/master/comments-plus.user.js) to install the userscript.

## Features

* Comment collapsing: Collapse a comment and all of its "descendants." In "Oldest First" order, this is the comment, any comment which replies to it, any reply to those replies, and so on. In "Newest First" order, this is the comment, any comment which it replied to, any comment which those comments replied to, and so on.
* Forward hiding: Clicking and expanding a quote link to a "forward" comment will hide the original comment (whether a link is forward or not depends on the comment order)

### Tweaks

* Expanded comments show the username in the header
* When possible, cross-page quote links show the username and comment index instead of the comment ID
* When possible, cross-page comments show the comment index in the header instead of the comment ID
* Comments expanded from callbacks are grouped together below the comment header (Normally, expanded comments are inserted after their callbacks, which can push down unexpanded callbacks)
* Quote links to the parent comment are disabled (somewhat prevents infinite expanding)
* Hovering on an expanded link does not show its comment
* Expanded comments do not expand with their own expanded comments

### Cosmetic

* Expanded quote links are grayed out
* When there are multiple quote links in an child comment, the link to the parent comment is underlined
* Removed 150ms delay to show comment when hovering over quote link

## Legal

This userscript is under the MIT License. A copy can be found in the `LICENSE` file.

Some of the code has been directly cribbed (copy and pasted, variables renamed, prettified, de-Closure Compiled) from the Fimfiction source code. When possible, the script wraps existing code. When this is not possible, large feature must be added on top of an existing one), code must be copied.

The code in question is `Copyright (c) 2011-2019 knighty & Xaquseg`. It is not provided under an open-source license, thus, this is copyright infringement. Hopefully, though, the amount copied is small enough that they don't mind.
