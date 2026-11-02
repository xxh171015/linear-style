# Custom Views are flat Issue queries with display on the view

Linear’s Custom View is a saved comparator tree over one of four models, with grouping/layout on separate View Preferences. This replica’s Custom View queries Issues only, matches with a seven-field AND, and stores grouping (`status | priority | assignee | project | none`) and layout (`list | board`) on the view itself. One user, one Team: no org/user preference merge, no FilterMatcher/hydrator, no project-mounted views.
