import sys
import threading
import logging
import traceback

from PyQt5.Qt import *

def excepthook(exctype, value, tb):
    logging.error("\n************!!!UNCAUGHT EXCEPTION!!!*********************\n" +
        ("Type: %s" % exctype) + '\n' +
        ("Value: %s" % value) + '\n' +
        ("Traceback:" + '\n') +
        " ".join(traceback.format_tb(tb)) +
        "************************************************************\n")
sys.excepthook = excepthook

def unraisablehook(exc_type, exc_value, exc_traceback, err_msg, object):
    logging.error("\n************!!!UNHANDLEABLE EXCEPTION!!!******************\n" +
        ("Type: %s" % exc_type) + '\n' +
        ("Value: %s" % exc_value) + '\n' +
        ("Message: %s " % err_msg) + '\n' +
        ("Traceback:" + '\n') +
        " ".join(traceback.format_tb(exc_traceback)) + '\n' +
        ("On Object: %s" + object) + '\n' +
        "************************************************************\n")
sys.unraisablehook = unraisablehook

def threading_excepthook(exc_type,exc_value,exc_traceback,thread):
    logging.error("\n************!!!UNCAUGHT THREADING EXCEPTION!!!***********\n" +
                  ("Type: %s" % exc_type) + '\n' +
                  ("Value: %s" % exc_value) + '\n' +
                  ("Traceback on thread %s: " % thread + '\n') +
                    " ".join(traceback.format_tb(exc_traceback)) +
                  "************************************************************\n")
threading.excepthook = threading_excepthook

__all__ = []