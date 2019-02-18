# Fimfiction Comments Plus

Userscript for enhanced Fimfiction comments. Inspired by [4chan X](https://www.4chan-x.net/).

## Features

* Comment collapsing: Collapse a comment and all of its descendants (any comment which replies to it, any reply to those replies, and so on)
* Forward hiding: Clicking and expanding a backlink (quote link in the header of a comment) will hide the original comment

### Tweaks

* Expanded comments show the username in the header
* When possible, cross-page quote links show the username and comment index instead of the comment ID
* When possible, cross-page comments show the comment index in the header instead of the comment ID
* Comments expanded from backlinks are grouped together below the comment header (Normally, expanded comments are inserted after their backlinks, which can push down unexpanded backlinks)
* No infinite expanding: Expanded comments cannot expand quote links which point to any of their ancestors
* Hovering on an expanded link does not show its comment
* Expanded comments do not expand with their own expanded comments

### Cosmetic

* Increased comment width (by decreasing right padding) for deeper nesting
* Removed 150ms delay to show comment when hovering over quote link

## Legal

This userscript is under the MIT License. A copy can be found in the `LICENSE` file.

Some of the code has been directly cribbed (copy and pasted, variables renamed, prettified, de-Closure Compiled) from the Fimfiction source code. When possible, the script wraps existing code. When this is not possible (e.g. a new, large feature must be added on top of an existing one) or would add complexity (e.g. forcing the use of MutationObserver), code must be copied.

The code in question is `Copyright (c) 2011-2019 knighty & Xaquseg`. It is not provided under an open-source license, thus, this is copyright infringement. Hopefully, though, the amount copied is small enough that they don't mind.
