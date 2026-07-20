#!/bin/sh

usage() {
  echo "Usage: $(basename $0) mode"
  echo "mode = idp|rp|as|as2|dpki|mock|frontend"
}

MODE=$1
case $MODE in
  idp|rp|as|as2|dpki|frontend)
    cd $MODE
    npm start
    ;;
  mock)
    node mock/mock-ndid-api.js
    ;;
  *)
    usage
    exit 1
    ;;
esac
