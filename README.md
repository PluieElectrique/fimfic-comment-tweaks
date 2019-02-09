# Fimfiction Comments Plus
Userscript for enhanced Fimfiction comments

## Features

### Enhancements
* Increased comment width (by decreasing right padding)
* Expand comments as fully collapsed
* Don't show comment when hovering on an expanded link
* Don't allow expanded child to expand parent
* Forward hiding of comments
* Collapse comments and their children

### Bug fixes (for Fimfiction)
* Fix header in hovered/expanded comments (show author and correct index)

## Inspired By

* 4chan X

## Legal

This userscript is under the MIT License. A copy can be found in the `LICENSE` file.

Some of the code has been directly cribbed (copy and pasted, variables renamed, prettified, de-Closure Compiled) from the Fimfiction source code. When possible, the script wraps existing code. When this is not possible (e.g. a new, large feature must be added on top of an existing one) or would add complexity (e.g. forcing the use of MutationObserver), code must be copied.

The code in question is `Copyright (c) 2011-2019 knighty & Xaquseg`. It is not provided under an open-source license, thus, this is copyright infringement. Hopefully, though, the amount copied is small enough that they don't mind.
