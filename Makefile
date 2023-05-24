all: dist

js = *.js
png = *.png
version = $(shell jq -r '.version' < manifest.json)

dist: $(js) $(png) manifest.json
	mkdir -p dist
	cp manifest.json dist/
	cp *.js dist/
	cp *.png dist/
	ls dist > DIST_MANIFEST.temp
	diff -u DIST_MANIFEST DIST_MANIFEST.temp

check_zip:
	test -f releases/transfix-mj-ext-$(version).zip && echo "Zip exists for v$(version), bump version" && exit 1 || echo "Building zip for v$(version)"

releases/transfix-mj-ext-$(version).zip: check_zip dist
	mkdir -p releases
	zip -j $@ dist/*

release: releases/transfix-mj-ext-$(version).zip

watch:
	while true; do $(MAKE) -q || $(MAKE); sleep 0.5; done

clean:
	rm -f DIST_MANIFEST.temp
	rm -rf dist

.PHONY: build watch clean release
