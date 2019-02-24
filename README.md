# Fimfiction Comments Plus

Userscript for enhanced Fimfiction comments. Inspired by [4chan X](https://www.4chan-x.net/).

## Install

Get Violentmonkey for [Firefox](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/) or [Chrome](https://chrome.google.com/webstore/detail/violent-monkey/jinjaccalgkegednnccohejagnlnfdag). It should also work in Tampermonkey. Greasemonkey is not supported.

Then, [click here](https://github.com/PluieElectrique/fimfic-comments-plus/raw/master/commentsplus.user.js) to install the userscript.

## Features

* Comment collapsing: Collapse a comment and all of its descendants (any comment which replies to it, any reply to those replies, and so on)
* Forward hiding: Clicking and expanding a callback (quote link in the header of a comment) will hide the original comment

### Tweaks

* Expanded comments show the username in the header
* When possible, cross-page quote links show the username and comment index instead of the comment ID
* When possible, cross-page comments show the comment index in the header instead of the comment ID
* Comments expanded from callbacks are grouped together below the comment header (Normally, expanded comments are inserted after their callbacks, which can push down unexpanded callbacks)
* No infinite expanding: Expanded comments cannot expand quote links which point to any of their ancestors
* Hovering on an expanded link does not show its comment
* Expanded comments do not expand with their own expanded comments

### Cosmetic

* Expanded quote links are grayed out
* Quote links to the parent are underlined
* Increased comment width (by decreasing right padding) for deeper nesting
* Removed 150ms delay to show comment when hovering over quote link

## Legal

This userscript is under the MIT License. A copy can be found in the `LICENSE` file.

Some of the code has been directly cribbed (copy and pasted, variables renamed, prettified, de-Closure Compiled) from the Fimfiction source code. When possible, the script wraps existing code. When this is not possible, large feature must be added on top of an existing one), code must be copied.

The code in question is `Copyright (c) 2011-2019 knighty & Xaquseg`. It is not provided under an open-source license, thus, this is copyright infringement. Hopefully, though, the amount copied is small enough that they don't mind.
