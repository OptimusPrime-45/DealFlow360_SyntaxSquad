# Design System

## 1. Design Direction

The entire application must follow the **Odoo visual design language**.

The goal is not to create a generic SaaS dashboard that merely uses purple.

The interface should feel like it belongs to the **Odoo ecosystem**:

- Odoo-inspired purple identity
- Warm, friendly enterprise aesthetic
- Clean white surfaces
- Soft gray backgrounds
- Strong but approachable typography
- Rounded UI elements
- Minimal shadows
- Generous whitespace
- Clear hierarchy
- Compact but readable application interfaces
- Modular page sections
- Consistent buttons and forms
- Professional enterprise SaaS appearance

The design should feel:

> **Professional + Friendly + Modular + Productive + Enterprise**

Do **not** use:

- Glassmorphism
- Neon gradients
- Cyberpunk styling
- Excessive animations
- Dark-first design
- Excessive rounded cards
- Generic Bootstrap dashboard styling
- Random gradient backgrounds
- Excessive shadows

The product should look like a **modern Odoo-style business application**, not a generic AI startup dashboard.

---

# 2. Odoo Design Philosophy

Odoo's website system is based around:

- Theme palettes
- Color combinations
- Typography
- Building blocks
- Consistent buttons
- Structured content
- Reusable components

Odoo's theme system uses five core theme colors, which are then used to generate combinations for backgrounds, text, headings, links, primary buttons, and secondary buttons.

Our implementation should follow the same conceptual system.

```text
                    DESIGN SYSTEM
                         │
          ┌──────────────┼──────────────┐
          │              │              │
       COLORS       TYPOGRAPHY       SPACING
          │              │              │
          └──────────────┼──────────────┘
                         │
                   COMPONENTS
                         │
          ┌──────────────┼──────────────┐
          │              │              │
       BUTTONS         FORMS          CARDS
          │              │              │
          └──────────────┼──────────────┘
                         │
                   PAGE BUILDING
                      BLOCKS
```

---

# 3. Odoo Color Palette

## 3.1 Primary Odoo Purple

The visual identity must be centered around Odoo's characteristic purple.

```text
Odoo Purple
#714B67
```

This is the dominant brand accent.

Use it for:

- Primary buttons
- Active navigation
- Links
- Selected states
- Important icons
- Highlights
- Focus states
- Key illustrations
- Brand elements

Do NOT use purple everywhere.

Purple should create hierarchy.

---

# 4. Five-Color Theme System

The implementation should conceptually follow Odoo's five-color palette architecture.

```text
o-color-1 → Primary
o-color-2 → Secondary
o-color-3 → Extra / Light
o-color-4 → White
o-color-5 → Black / Dark
```

Odoo's developer documentation explicitly uses this five-color structure.

Recommended application palette:

| Token | Color | Purpose |
|---|---|---|
| `color-1` | `#714B67` | Primary purple |
| `color-2` | `#212529` | Secondary / dark |
| `color-3` | `#F3EEF2` | Light purple |
| `color-4` | `#FFFFFF` | White |
| `color-5` | `#212529` | Dark text |

---

# 5. Complete Color Tokens

```text
PRIMARY
#714B67

PRIMARY-HOVER
#5F3D56

PRIMARY-ACTIVE
#513349

PRIMARY-LIGHT
#F3EEF2
```

## Backgrounds

```text
BACKGROUND
#FFFFFF

BACKGROUND-SOFT
#F8F9FA

BACKGROUND-GRAY
#F1F2F3

BACKGROUND-PURPLE
#F3EEF2
```

## Typography

```text
TEXT
#212529

TEXT-SECONDARY
#495057

TEXT-MUTED
#6C757D

TEXT-LIGHT
#868E96

TEXT-ON-PRIMARY
#FFFFFF
```

## Borders

```text
BORDER
#DEE2E6

BORDER-LIGHT
#E9ECEF

BORDER-DARK
#CED4DA
```

---

# 6. Status Colors

Status colors should remain independent from the brand color.

```text
SUCCESS
#28A745

WARNING
#F0AD00

ERROR
#DC3545

INFO
#17A2B8
```

Use status colors only for:

- Success
- Warning
- Error
- Information
- Validation
- System notifications

Do not use status colors as decorative accents.

Odoo itself treats status colors separately from theme colors.

---

# 7. Color Usage Ratio

The interface should approximately follow:

```text
60%  White / Neutral
25%  Light Gray / Soft backgrounds
10%  Dark Typography
5%   Odoo Purple / Accent
```

Purple should be an **accent**, not the page background.

Bad:

```text
████████████████████████
████ PURPLE EVERYTHING ███
████████████████████████
```

Good:

```text
White page
        ↓
Dark typography
        ↓
Purple CTA
        ↓
Purple active state
        ↓
Soft purple highlights
```

---

# 8. Typography

Typography is one of the most important parts of the design.

Odoo allows font families and sizes to be configured across paragraphs, headings, buttons, and inputs.

The application should use a **clean humanist sans-serif style** consistent with the Odoo ecosystem.

## Primary Font

```text
Inter
```

Fallback:

```text
system-ui,
-apple-system,
BlinkMacSystemFont,
"Segoe UI",
sans-serif
```

If the project already has access to an official Odoo font asset, use that asset instead of introducing another visual language.

---

# 9. Typography Characteristics

Typography should be:

- Friendly
- Rounded in appearance
- Highly readable
- Medium-weight rather than excessively bold
- Spacious
- Professional

Avoid:

```text
Ultra-bold
Condensed fonts
Display fonts
Monospace UI typography
Decorative fonts
```

---

# 10. Type Scale

## Display

```text
64px
Weight: 600–700
Line height: 1.05
Letter spacing: -0.02em
```

Used only for major marketing headlines.

---

## H1

```text
48px
Weight: 600
Line height: 1.15
```

---

## H2

```text
36px
Weight: 600
Line height: 1.2
```

---

## H3

```text
28px
Weight: 600
Line height: 1.25
```

---

## H4

```text
22px
Weight: 600
Line height: 1.3
```

---

## Body

```text
16px
Weight: 400
Line height: 1.6
```

---

## Small

```text
14px
Weight: 400
Line height: 1.5
```

---

## Caption

```text
12px
Weight: 400
Line height: 1.4
```

---

# 11. Typography Hierarchy

Do not create hierarchy through excessive font-weight changes.

Use:

```text
Size
↓
Spacing
↓
Color
↓
Weight
```

Example:

```text
Dashboard

Your workspace overview

124
Total Projects

48
Active Projects
```

The numbers are larger.

The labels are smaller.

Supporting information is muted.

---

# 12. Layout Philosophy

The application should use a **structured, centered layout**.

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│                        HEADER                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    ┌──────────────┐                          │
│                    │              │                          │
│                    │   CONTENT    │                          │
│                    │              │                          │
│                    └──────────────┘                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Maximum content width:

```text
1200px – 1320px
```

For dashboard/application screens:

```text
Sidebar
240px
+
Main content
remaining width
```

---

# 13. Spacing System

Use an 8px spacing system.

```text
4px
8px
12px
16px
24px
32px
48px
64px
80px
96px
120px
```

Primary spacing:

```text
Component gap:      16px
Card padding:       24px
Section gap:        48px
Major section:      80px
Hero section:       96–120px
```

---

# 14. Border Radius

Odoo's style should feel rounded but not excessively rounded.

Use:

```text
Small:      4px
Default:    6px
Medium:     8px
Large:      12px
Pill:       999px
```

Default application component:

```text
border-radius: 6px
```

Cards:

```text
border-radius: 8px
```

Large marketing blocks:

```text
border-radius: 12px
```

Avoid:

```text
24px+
```

for normal application components.

---

# 15. Borders

Borders are more important than shadows.

Default:

```text
1px solid #DEE2E6
```

Use borders for:

- Cards
- Inputs
- Tables
- Navigation separators
- Dropdowns
- Modals

The UI should feel structured without floating every component.

---

# 16. Shadows

Use very subtle shadows.

Default:

```text
0 2px 6px rgba(0, 0, 0, 0.05)
```

Dropdown:

```text
0 4px 16px rgba(0, 0, 0, 0.10)
```

Modal:

```text
0 12px 32px rgba(0, 0, 0, 0.14)
```

Do not use heavy shadows on normal cards.

---

# 17. Header

The marketing header should resemble a modern Odoo website structure.

```text
┌──────────────────────────────────────────────────────────────────┐
│ LOGO   Apps   Industries   Community   Pricing   Resources       │
│                                            Sign In  [Try it free]│
└──────────────────────────────────────────────────────────────────┘
```

Characteristics:

- White background
- Dark text
- Purple CTA
- Minimal border
- Medium height
- Clear navigation
- Dropdown menus
- Strong logo

---

# 18. Header Navigation

Navigation items:

```text
font-size: 14–16px
font-weight: 500
color: #212529
```

Hover:

```text
color: #714B67
```

Active:

```text
color: #714B67
```

Dropdown:

```text
White background
Border
Subtle shadow
6–8px radius
```

---

# 19. Application Sidebar

For authenticated areas:

```text
┌──────────────────────┐
│ LOGO                 │
│                      │
│ Dashboard            │
│ Projects             │
│ Tasks                │
│ Reports              │
│ Users                │
│                      │
│ ──────────────────── │
│ Settings             │
│ Help                 │
│                      │
│ User                 │
└──────────────────────┘
```

Width:

```text
240px
```

Background:

```text
#FFFFFF
```

Border:

```text
1px solid #E9ECEF
```

---

# 20. Sidebar Active State

Inactive:

```text
background: transparent
color: #495057
```

Hover:

```text
background: #F8F9FA
```

Active:

```text
background: #F3EEF2
color: #714B67
```

Active navigation should use a subtle purple tint.

Never use a giant purple block.

---

# 21. Page Header

Application pages should follow:

```text
Breadcrumb
     ↓
Page title
     ↓
Description
     ↓
Actions
```

Example:

```text
Home / Projects

Projects

Manage and track all your projects.

                         [ + New Project ]
```

---

# 22. Buttons

Buttons should closely follow Odoo's simple business-software aesthetic.

Odoo provides separate primary and secondary button styles as part of its theme system.

## Primary

```text
Background: #714B67
Text: #FFFFFF
Border: #714B67
Radius: 6px
Height: 40–44px
Padding: 12px 20px
```

Example:

```text
[ Create Project ]
```

Hover:

```text
#5F3D56
```

---

# 23. Secondary Button

```text
Background: #FFFFFF
Text: #212529
Border: #DEE2E6
Radius: 6px
```

Example:

```text
[ Cancel ]
```

Hover:

```text
Background: #F8F9FA
```

---

# 24. Link Buttons

Links should use Odoo purple.

```text
color: #714B67
```

Example:

```text
Learn more →
```

Avoid underlining every UI link.

Underline on hover where appropriate.

---

# 25. Cards

Cards should be **functional containers**, not giant decorative objects.

```text
┌─────────────────────────────────────────────┐
│ Project Overview                            │
│                                             │
│ 124                                         │
│ Total Projects                              │
│                                             │
│ +12% this month                             │
└─────────────────────────────────────────────┘
```

Properties:

```text
Background: #FFFFFF
Border: #DEE2E6
Radius: 8px
Padding: 24px
```

---

# 26. Stat Cards

Stat cards should prioritize numbers.

```text
┌────────────────────────────┐
│ Total Projects             │
│                            │
│ 124                        │
│                            │
│ ↑ 12% from last month      │
└────────────────────────────┘
```

Number:

```text
32px
font-weight: 600
```

Label:

```text
14px
color: #6C757D
```

---

# 27. Tables

Odoo-style enterprise applications rely heavily on structured information.

Tables should be:

- Dense
- Readable
- Scannable
- Structured
- Functional

```text
┌─────────────────────────────────────────────────────────────┐
│ Project       Owner       Status       Updated       Actions │
├─────────────────────────────────────────────────────────────┤
│ Alpha         Neeraj      Active       Today          ⋮     │
│ Beta          Rahul       Pending      Yesterday      ⋮     │
│ Gamma         Priya       Complete     Sep 01         ⋮     │
└─────────────────────────────────────────────────────────────┘
```

Avoid excessive row heights.

---

# 28. Table Styling

Header:

```text
font-size: 13px
font-weight: 600
color: #495057
background: #F8F9FA
```

Rows:

```text
font-size: 14px
```

Hover:

```text
background: #F8F9FA
```

Borders:

```text
#E9ECEF
```

---

# 29. Forms

Forms should be extremely clean.

```text
Project Name
[______________________________________]

Description
[______________________________________]
[______________________________________]

Status
[ Active                         ▼ ]

                [ Cancel ] [ Save ]
```

Label:

```text
14px
font-weight: 500
```

Input:

```text
height: 40–44px
border: 1px solid #CED4DA
radius: 6px
```

Focus:

```text
border: #714B67
box-shadow: 0 0 0 2px #F3EEF2
```

---

# 30. Input Fields

Default:

```text
background: #FFFFFF
border: #CED4DA
```

Hover:

```text
border: #ADB5BD
```

Focus:

```text
border: #714B67
```

Error:

```text
border: #DC3545
```

Disabled:

```text
background: #F1F3F5
color: #868E96
```

---

# 31. Dropdowns

Dropdown menus should resemble enterprise productivity software.

```text
┌────────────────────────────┐
│ Select option          ▼   │
└────────────────────────────┘
```

Menu:

```text
┌────────────────────────────┐
│ Option A                   │
│ Option B                   │
│ Option C                   │
│ ────────────────────────── │
│ Manage options             │
└────────────────────────────┘
```

Use:

```text
White background
8px radius
Subtle shadow
Compact spacing
```

---

# 32. Badges

Badges should be small and subtle.

Active:

```text
[ ● Active ]
```

Pending:

```text
[ ● Pending ]
```

Completed:

```text
[ ● Completed ]
```

Avoid huge pill badges.

Default radius:

```text
4px
```

---

# 33. Hero Section

Marketing pages should use Odoo's **friendly enterprise SaaS** style.

```text
                    Manage your business
                    in one powerful platform

             Everything you need to manage,
             automate and grow your workflow.

             [ Start Free ]   [ Contact Sales ]

                     ┌───────────────┐
                     │ Product UI    │
                     │ Screenshot    │
                     └───────────────┘
```

The hero should prioritize:

1. Headline
2. Value proposition
3. CTA
4. Product visualization

---

# 34. Hero Typography

Headline:

```text
56–64px
Weight: 600
Color: #212529
```

Important words may use:

```text
#714B67
```

Do not use:

```text
rainbow gradients
gradient text
neon glow
```

---

# 35. Feature Building Blocks

The application should use modular building blocks inspired by Odoo's website builder.

Odoo explicitly structures website creation around reusable building blocks.

Examples:

```text
Hero
↓
Feature Grid
↓
Product Showcase
↓
Statistics
↓
Workflow
↓
Testimonials
↓
CTA
↓
Footer
```

Each block should be reusable.

---

# 36. Feature Grid

```text
                    Everything you need

        Powerful tools designed for modern teams.

┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│      ICON        │ │      ICON        │ │      ICON        │
│                  │ │                  │ │                  │
│ Project Mgmt     │ │ Automation       │ │ Analytics        │
│                  │ │                  │ │                  │
│ Description      │ │ Description      │ │ Description      │
│                  │ │                  │ │                  │
│ Learn more →     │ │ Learn more →     │ │ Learn more →     │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

---

# 37. Alternating Product Sections

Use large visual blocks.

```text
┌──────────────────────┬──────────────────────────┐
│                      │                          │
│   PRODUCT IMAGE      │   Powerful workflow      │
│                      │                          │
│                      │   Description            │
│                      │                          │
│                      │   Learn more →           │
│                      │                          │
└──────────────────────┴──────────────────────────┘
```

Then reverse the layout.

This creates a visual rhythm similar to modern Odoo marketing pages.

---

# 38. CTA Sections

CTA sections should use the primary purple sparingly.

```text
┌─────────────────────────────────────────────────────┐
│                                                     │
│        Ready to simplify your workflow?             │
│                                                     │
│       Start managing everything in one place.       │
│                                                     │
│                 [ Get Started ]                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Background:

```text
#714B67
```

Text:

```text
#FFFFFF
```

---

# 39. Dashboard Structure

Dashboard:

```text
┌───────────────────────────────────────────────────────────┐
│ Sidebar │ Topbar                                          │
│         ├─────────────────────────────────────────────────┤
│         │ Dashboard                                       │
│         │                                                 │
│         │ Welcome back                                    │
│         │                                                 │
│         │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│         │ │ 124    │ │ 48     │ │ 76     │ │ 12     │    │
│         │ └────────┘ └────────┘ └────────┘ └────────┘    │
│         │                                                 │
│         │ Recent Projects                                 │
│         │ ┌─────────────────────────────────────────────┐ │
│         │ │ Table                                       │ │
│         │ └─────────────────────────────────────────────┘ │
│         │                                                 │
└─────────┴─────────────────────────────────────────────────┘
```

---

# 40. Dashboard Background

Use:

```text
#F8F9FA
```

for the application workspace.

Cards remain:

```text
#FFFFFF
```

This creates separation without requiring heavy shadows.

---

# 41. Topbar

Topbar:

```text
┌───────────────────────────────────────────────────────────┐
│ ☰   Search...                         Notifications  User │
└───────────────────────────────────────────────────────────┘
```

Background:

```text
#FFFFFF
```

Border:

```text
#E9ECEF
```

---

# 42. Search

Search should feel integrated into the application.

```text
┌──────────────────────────────────┐
│ 🔍 Search anything...            │
└──────────────────────────────────┘
```

Use:

```text
Background: #F8F9FA
Border: #E9ECEF
Radius: 6px
```

Focus:

```text
Border: #714B67
Background: #FFFFFF
```

---

# 43. Modals

Modal:

```text
┌──────────────────────────────────────────────┐
│ Create Project                          ×    │
├──────────────────────────────────────────────┤
│                                              │
│ Project Name                                 │
│ [________________________________________]   │
│                                              │
│ Description                                  │
│ [________________________________________]   │
│                                              │
├──────────────────────────────────────────────┤
│                         [ Cancel ] [ Create ]│
└──────────────────────────────────────────────┘
```

Properties:

```text
Background: #FFFFFF
Radius: 8px
Shadow: subtle
```

---

# 44. Toast Notifications

Success:

```text
┌─────────────────────────────────────┐
│ ✓  Project created successfully.    │
└─────────────────────────────────────┘
```

Error:

```text
┌─────────────────────────────────────┐
│ ×  Unable to create project.        │
└─────────────────────────────────────┘
```

Keep notifications compact.

---

# 45. Empty States

Empty states should be friendly and action-oriented.

```text
              ┌───────────┐
              │   ICON    │
              └───────────┘

              No projects yet

        Create your first project
        to start managing your work.

              [ Create Project ]
```

Use soft purple illustrations where appropriate.

---

# 46. Icons

Use one consistent icon library.

Recommended:

```text
Lucide
```

Icons:

```text
16px
18px
20px
24px
```

Use purple only for important icon states.

---

# 47. Illustrations

Illustrations should follow the Odoo aesthetic:

- Flat
- Friendly
- Simple
- Geometric
- Soft
- Purple-centered
- Minimal detail

Avoid:

- 3D glossy illustrations
- Cyberpunk illustrations
- Neon effects
- Excessive gradients
- Photorealistic AI artwork for ordinary UI sections

---

# 48. Images

Product imagery should focus on the actual application.

Preferred:

```text
UI screenshots
Dashboard previews
Workflow diagrams
Product mockups
Simple illustrations
```

Avoid generic:

```text
Corporate handshake photos
Random office stock images
Generic AI-generated business people
```

---

# 49. Animation

Animation should be subtle.

Default:

```text
150–250ms
ease-out
```

Use animation for:

- Dropdowns
- Modals
- Hover states
- Sidebar
- Toasts
- Tabs
- Buttons

Do not animate every card when the page loads.

The interface should feel **fast and productive**.

---

# 50. Responsive Design

## Desktop

```text
Sidebar + Main Content
```

## Tablet

```text
Collapsed Sidebar
+
Main Content
```

## Mobile

```text
Topbar
↓
Page
↓
Bottom navigation / drawer
```

Grid:

```text
Desktop → 3 / 4 columns
Tablet  → 2 columns
Mobile  → 1 column
```

---

# 51. Mobile Navigation

Mobile should use:

```text
┌─────────────────────────────┐
│ ☰  Logo             Profile │
└─────────────────────────────┘
```

Sidebar becomes a drawer.

Do not simply shrink the desktop sidebar.

---

# 52. Accessibility

Requirements:

- WCAG-conscious contrast
- Keyboard navigation
- Visible focus states
- Semantic HTML
- Proper labels
- Accessible dialogs
- Accessible dropdowns
- Accessible tables
- Alt text
- Screen-reader-friendly status indicators

Never communicate important information through color alone.

---

# 53. Component System

Recommended structure:

```text
components/
│
├── ui/
│   ├── button
│   ├── input
│   ├── select
│   ├── textarea
│   ├── checkbox
│   ├── radio
│   ├── badge
│   ├── card
│   ├── modal
│   ├── dropdown
│   ├── tooltip
│   ├── tabs
│   ├── table
│   └── toast
│
├── layout/
│   ├── header
│   ├── sidebar
│   ├── topbar
│   ├── footer
│   └── page-container
│
├── dashboard/
│   ├── stat-card
│   ├── activity-feed
│   ├── chart-card
│   └── recent-table
│
└── sections/
    ├── hero
    ├── feature-grid
    ├── product-showcase
    ├── stats
    ├── workflow
    ├── testimonial
    └── cta
```

---

# 54. Design Tokens

All visual values should be centralized.

Example:

```text
colors.primary
colors.primaryHover
colors.primaryLight

colors.background
colors.surface
colors.surfaceMuted

colors.text
colors.textSecondary
colors.textMuted

colors.border

colors.success
colors.warning
colors.error
colors.info

radius.sm
radius.md
radius.lg

spacing.xs
spacing.sm
spacing.md
spacing.lg
spacing.xl
```

Do not hardcode random colors throughout the application.

---

# 55. Tailwind Implementation

If using Tailwind CSS, define the design tokens in the theme rather than repeatedly writing arbitrary values.

Example conceptual mapping:

```text
primary
→ #714B67

primary-hover
→ #5F3D56

primary-light
→ #F3EEF2

background
→ #FFFFFF

surface
→ #F8F9FA

border
→ #DEE2E6

foreground
→ #212529

muted
→ #6C757D

success
→ #28A745

warning
→ #F0AD00

danger
→ #DC3545
```

The application should use semantic names:

```text
bg-primary
text-primary
border-default
text-muted
bg-surface
```

rather than repeatedly using raw hex values.

---

# 56. Visual Do / Don't

## DO

```text
✓ White surfaces
✓ Odoo purple accents
✓ Soft gray backgrounds
✓ Clean typography
✓ Moderate rounded corners
✓ Subtle borders
✓ Minimal shadows
✓ Compact enterprise UI
✓ Clear hierarchy
✓ Modular sections
✓ Functional animations
```

## DON'T

```text
✗ Neon gradients
✗ Glassmorphism
✗ Huge rounded containers
✗ Dark dashboard everywhere
✗ Excessive purple
✗ Excessive shadows
✗ Floating cards everywhere
✗ Decorative animations
✗ Generic AI startup aesthetic
✗ Random color palettes
```

---

# 57. Overall Visual Reference

The final visual hierarchy should resemble:

```text
                  ODOO-INSPIRED
                       │
                       ▼
              ┌─────────────────┐
              │     PURPLE      │
              │    #714B67      │
              └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │     WHITE       │
              │    SURFACES     │
              └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  DARK TEXT      │
              │    #212529      │
              └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ SOFT GRAY SPACE │
              │    #F8F9FA      │
              └─────────────────┘
                       │
                       ▼
               CLEAN + FRIENDLY
                       │
                       ▼
              ENTERPRISE PRODUCT
```

---

# 58. Final Design Rule

The most important rule:

> **Do not merely color the application purple. Build the entire interface around the Odoo design philosophy.**

Every page should feel like it is part of the same design system.

The relationship should be:

```text
Odoo Color System
        +
Odoo Typography
        +
Odoo Spacing
        +
Odoo Buttons
        +
Odoo Forms
        +
Odoo Building Blocks
        +
Odoo Enterprise UX
        ↓
   CONSISTENT PRODUCT
```

The result should be immediately recognizable as **Odoo-inspired**, while still retaining the application's own branding, information architecture, and functionality.