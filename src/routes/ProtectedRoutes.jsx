import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import localStorageKeys from '../constant/localStorageKeys';
import { ROUTES_CONST } from '../constant/routeConstant';



const Protected = (props) => {
  const {Component} = props  
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem(localStorageKeys.token);
    if (!token) {
      navigate(ROUTES_CONST.AUTH.SIGNIN);
    } else {
      setIsLoggedIn(true);
    }
  }, [navigate]);

  return isLoggedIn ? <Component /> : null;
};

export default Protected;
