# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).


## [0.2.1] - 2018-05-06
### Fixed
- Use java class path from `/opt/solr` instead of user home

### Changed
- Upgraded fs-extra to 6.0.0

## [0.2.0] - 2018-05-03
### Added
- Support posting notification to discord. See `config.default.json`

## [0.1.1] - 2018-05-02
### Changed
- Updated some information on README.md

## [0.1.0] - 2018-05-01
### Added
- Initial commit
- 6 script commands
  - `npm run create-core -- [num_of_cores]`
  - `npm run delete-core`
  - `npm run hash`
  - `npm run load`
  - `npm run check-new -- [last_n_minutes]`
  - `npm run watch`
- 1 demo script
  - `node src/search.js /tmp/1.jpg`
